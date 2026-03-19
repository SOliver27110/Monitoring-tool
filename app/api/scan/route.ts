import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { searchArticles } from '@/lib/google-news-rss';
import { analyseContent, NEEDS_REVIEW_THRESHOLD } from '@/lib/anthropic';
import { ensureUserInSupabase } from '@/lib/auth';
import Parser from 'rss-parser';
import { createHash } from 'crypto';

export const maxDuration = 60;

const rssParser = new Parser();

/**
 * Parse a boolean search string (e.g. "David Lloyd OR Bedford Oasis OR 24/01234")
 * into individual search terms, stripping surrounding quotes.
 */
function parseSearchTerms(booleanSearchTerms: string): string[] {
  return booleanSearchTerms
    .split(/\s+OR\s+/i)
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter((t) => t.length > 0);
}

/**
 * Generate partial match candidates from a field value.
 */
function partialTerms(value: string): string[] {
  const words = value.trim().split(/\s+/);
  if (words.length <= 1) return [];
  const terms: string[] = [];
  for (let len = words.length; len >= 2; len--) {
    for (let start = 0; start <= words.length - len; start++) {
      terms.push(words.slice(start, start + len).join(' '));
    }
  }
  return terms;
}

const PLANNING_KEYWORDS = [
  'planning',
  'development',
  'homes',
  'housing',
  'application',
  'approval',
  'construction',
  'demolition',
  'council',
  'residents',
  'objection',
  'consultation',
  'proposed',
  'permission',
  'affordable homes',
  'green belt',
  'brownfield',
  'regeneration',
  'infrastructure',
  'zoning',
  'rezoning',
  'building permit',
  'land use',
  'local plan',
  'outline permission',
  'reserved matters',
  'section 106',
  's106',
  'environmental impact',
  'listed building',
  'conservation area',
];

function hasPlanningRelevance(text: string): boolean {
  const lower = text.toLowerCase();
  return PLANNING_KEYWORDS.some((kw) => lower.includes(kw));
}

function classifyMatch(
  text: string,
  project: {
    client_name: string;
    site_name: string;
    planning_reference: string;
    boolean_search_terms: string;
  }
): { match_type: 'project_specific' | 'area_intelligence'; match_reason: string } {
  const lower = text.toLowerCase();

  if (project.boolean_search_terms) {
    const terms = parseSearchTerms(project.boolean_search_terms);
    for (const term of terms) {
      if (term && lower.includes(term.toLowerCase())) {
        return {
          match_type: 'project_specific',
          match_reason: `Matched: search term '${term}'`,
        };
      }
    }
  }

  if (project.planning_reference && lower.includes(project.planning_reference.toLowerCase())) {
    return {
      match_type: 'project_specific',
      match_reason: `Matched: planning reference '${project.planning_reference}'`,
    };
  }
  if (project.site_name && lower.includes(project.site_name.toLowerCase())) {
    return {
      match_type: 'project_specific',
      match_reason: `Matched: site name '${project.site_name}'`,
    };
  }
  if (project.client_name && lower.includes(project.client_name.toLowerCase())) {
    return {
      match_type: 'project_specific',
      match_reason: `Matched: client name '${project.client_name}'`,
    };
  }

  for (const term of partialTerms(project.site_name ?? '')) {
    if (lower.includes(term.toLowerCase())) {
      return {
        match_type: 'project_specific',
        match_reason: `Partial match: site name fragment '${term}'`,
      };
    }
  }
  for (const term of partialTerms(project.client_name ?? '')) {
    if (lower.includes(term.toLowerCase())) {
      return {
        match_type: 'project_specific',
        match_reason: `Partial match: client name fragment '${term}'`,
      };
    }
  }

  return {
    match_type: 'area_intelligence',
    match_reason: 'No direct project identifiers found in article text',
  };
}

/** Generate a stable GUID for deduplication */
function makeGuid(url: string, title: string): string {
  if (url) return url;
  return createHash('sha256').update(title).digest('hex').slice(0, 64);
}

interface RawArticle {
  title: string;
  excerpt: string | null;
  url: string;
  source_name: string;
  published_at: string | null;
}

/**
 * Fetch articles from a feed based on its type.
 */
async function fetchFeedArticles(
  feedType: string,
  feedUrl: string
): Promise<RawArticle[]> {
  if (feedType === 'google_news') {
    const articles = await searchArticles(feedUrl, 25);
    return articles.map((a) => ({
      title: a.title,
      excerpt: a.description,
      url: a.url,
      source_name: a.source.name,
      published_at: a.publishedAt,
    }));
  }

  // All other types (local_news, planning_press, council) are direct RSS
  try {
    const feed = await rssParser.parseURL(feedUrl);
    return (feed.items ?? []).slice(0, 25).map((item) => {
      const snippet = item.contentSnippet || item.content || null;
      return {
        title: item.title ?? '',
        excerpt: snippet ? snippet.slice(0, 500) : null,
        url: item.link ?? '',
        source_name: feed.title ?? 'RSS Feed',
        published_at: item.pubDate ?? null,
      };
    });
  } catch (err) {
    console.error(`[RSS Direct] Failed to fetch feed "${feedUrl}":`, err);
    return [];
  }
}

export async function POST() {
  const userId = await ensureUserInSupabase();

  // Fetch all projects
  const { data: projects, error: projErr } = await supabaseAdmin
    .from('projects')
    .select('id, client_name, site_name, planning_reference, lpa, boolean_search_terms');

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ message: 'No projects to scan', results: [] });
  }

  // Fetch all active feeds
  const { data: allFeeds } = await supabaseAdmin
    .from('feeds')
    .select('id, project_id, name, feed_type, url, is_active');

  const feeds = (allFeeds ?? []).filter((f) => f.is_active);

  // Build a map of project_id -> feeds
  const feedsByProject = new Map<string, typeof feeds>();
  for (const feed of feeds) {
    const existing = feedsByProject.get(feed.project_id) ?? [];
    existing.push(feed);
    feedsByProject.set(feed.project_id, existing);
  }

  // Get existing GUIDs to avoid duplicates
  const { data: existingArticles } = await supabaseAdmin
    .from('fetched_articles')
    .select('guid');

  const existingGuids = new Set(
    (existingArticles ?? []).map((a) => a.guid)
  );

  const results: Array<{
    project_id: string;
    project_name: string;
    feeds_scanned: number;
    articles_found: number;
    articles_fetched: number;
    articles_matched: number;
    articles_analysed: number;
    articles_skipped_duplicate: number;
    articles_skipped_irrelevant: number;
    articles_needs_review: number;
    errors: string[];
  }> = [];

  for (const project of projects) {
    const projectFeeds = feedsByProject.get(project.id);

    // Fallback: if no feeds configured, use boolean_search_terms as a Google News search
    const feedSources = projectFeeds && projectFeeds.length > 0
      ? projectFeeds.map((f) => ({ type: f.feed_type, url: f.url, id: f.id }))
      : project.boolean_search_terms
        ? [{ type: 'google_news', url: project.boolean_search_terms, id: null as string | null }]
        : [];

    if (feedSources.length === 0) {
      results.push({
        project_id: project.id,
        project_name: `${project.client_name} – ${project.site_name}`,
        feeds_scanned: 0,
        articles_found: 0,
        articles_fetched: 0,
        articles_matched: 0,
        articles_analysed: 0,
        articles_skipped_duplicate: 0,
        articles_skipped_irrelevant: 0,
        articles_needs_review: 0,
        errors: ['No feeds or search terms configured'],
      });
      continue;
    }

    const projectResult = {
      project_id: project.id,
      project_name: `${project.client_name} – ${project.site_name}`,
      feeds_scanned: feedSources.length,
      articles_found: 0,
      articles_fetched: 0,
      articles_matched: 0,
      articles_analysed: 0,
      articles_skipped_duplicate: 0,
      articles_skipped_irrelevant: 0,
      articles_needs_review: 0,
      errors: [] as string[],
    };

    for (const feedSource of feedSources) {
      try {
        const rawArticles = await fetchFeedArticles(feedSource.type, feedSource.url);
        projectResult.articles_found += rawArticles.length;

        for (const article of rawArticles) {
          const guid = makeGuid(article.url, article.title);

          // Skip duplicates
          if (existingGuids.has(guid)) {
            projectResult.articles_skipped_duplicate++;
            continue;
          }

          // Build text for relevance check
          const text = [article.title, article.excerpt].filter(Boolean).join('\n\n');
          if (!text.trim()) continue;

          // Skip articles with no planning relevance
          if (!hasPlanningRelevance(text)) {
            projectResult.articles_skipped_irrelevant++;
            continue;
          }

          // Classify match
          const { match_type, match_reason } = classifyMatch(text, project);
          const status = match_type === 'project_specific' ? 'matched' : 'unmatched';

          // Insert into fetched_articles
          const { data: fetchedArticle, error: fetchErr } = await supabaseAdmin
            .from('fetched_articles')
            .insert({
              feed_id: feedSource.id,
              project_id: project.id,
              title: article.title,
              excerpt: article.excerpt,
              url: article.url,
              source_name: article.source_name,
              published_at: article.published_at,
              guid,
              matched_by: match_reason,
              status,
            })
            .select('id')
            .single();

          if (fetchErr) {
            // Likely a duplicate GUID race condition — skip
            if (fetchErr.code === '23505') {
              projectResult.articles_skipped_duplicate++;
            } else {
              projectResult.errors.push(`${article.title}: ${fetchErr.message}`);
            }
            continue;
          }

          existingGuids.add(guid);
          projectResult.articles_fetched++;

          if (match_type === 'project_specific') {
            projectResult.articles_matched++;
          }

          // Analyse matched articles (and unmatched with planning relevance)
          try {
            const analysis = await analyseContent(text);
            const needsReview = analysis.confidence_score < NEEDS_REVIEW_THRESHOLD;

            const { data: analysisItem } = await supabaseAdmin
              .from('analysis_items')
              .insert({
                project_id: project.id,
                source_text: text,
                source_type: 'news_article',
                source_url: article.url,
                summary: analysis.summary,
                sentiment: analysis.sentiment,
                alert_level: analysis.alert_level,
                notable_voices: analysis.notable_voices,
                key_themes: analysis.key_themes,
                recommended_action: analysis.recommended_action,
                review_status: 'unreviewed',
                match_type,
                match_reason,
                confidence_score: analysis.confidence_score,
                needs_review: needsReview,
                created_by: userId,
              })
              .select('id')
              .single();

            // Link fetched_article to analysis_item
            if (analysisItem && fetchedArticle) {
              await supabaseAdmin
                .from('fetched_articles')
                .update({
                  status: 'analysed',
                  analysis_item_id: analysisItem.id,
                })
                .eq('id', fetchedArticle.id);
            }

            projectResult.articles_analysed++;
            if (needsReview) projectResult.articles_needs_review++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Analysis failed';
            projectResult.errors.push(`${article.title}: ${msg}`);
          }
        }

        // Update last_fetched_at on the feed
        if (feedSource.id) {
          await supabaseAdmin
            .from('feeds')
            .update({ last_fetched_at: new Date().toISOString() })
            .eq('id', feedSource.id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Feed fetch failed';
        projectResult.errors.push(msg);
      }

      // Delay between feeds
      await new Promise((r) => setTimeout(r, 1000));
    }

    results.push(projectResult);

    // Delay between projects
    await new Promise((r) => setTimeout(r, 1500));
  }

  const totalAnalysed = results.reduce((sum, r) => sum + r.articles_analysed, 0);
  const totalFound = results.reduce((sum, r) => sum + r.articles_found, 0);
  const totalDuplicates = results.reduce((sum, r) => sum + r.articles_skipped_duplicate, 0);
  const totalIrrelevant = results.reduce((sum, r) => sum + r.articles_skipped_irrelevant, 0);
  const totalNeedsReview = results.reduce((sum, r) => sum + r.articles_needs_review, 0);
  const totalFetched = results.reduce((sum, r) => sum + r.articles_fetched, 0);

  return NextResponse.json({
    message: `Scan complete. ${totalFetched} articles fetched, ${totalAnalysed} analysed from ${totalFound} found. Skipped: ${totalDuplicates} duplicate(s), ${totalIrrelevant} irrelevant. ${totalNeedsReview} flagged for review.`,
    results,
  });
}
