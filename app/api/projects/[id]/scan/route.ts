import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { searchArticles } from '@/lib/google-news-rss';
import { ensureUserInSupabase } from '@/lib/auth';
import Parser from 'rss-parser';
import { createHash } from 'crypto';

export const maxDuration = 60;

const rssParser = new Parser();

// ─── Helpers ─────────────────────────────────────────────────────────

function parseSearchTerms(booleanSearchTerms: string): string[] {
  return booleanSearchTerms
    .split(/\s+OR\s+/i)
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter((t) => t.length > 0);
}

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
  'planning', 'development', 'homes', 'housing', 'application', 'approval',
  'construction', 'demolition', 'council', 'residents', 'objection',
  'consultation', 'proposed', 'permission', 'affordable homes', 'green belt',
  'brownfield', 'regeneration', 'infrastructure', 'zoning', 'rezoning',
  'building permit', 'land use', 'local plan', 'outline permission',
  'reserved matters', 'section 106', 's106', 'environmental impact',
  'listed building', 'conservation area',
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
        return { match_type: 'project_specific', match_reason: `Matched: search term '${term}'` };
      }
    }
  }

  if (project.planning_reference && lower.includes(project.planning_reference.toLowerCase())) {
    return { match_type: 'project_specific', match_reason: `Matched: planning reference '${project.planning_reference}'` };
  }
  if (project.site_name && lower.includes(project.site_name.toLowerCase())) {
    return { match_type: 'project_specific', match_reason: `Matched: site name '${project.site_name}'` };
  }
  if (project.client_name && lower.includes(project.client_name.toLowerCase())) {
    return { match_type: 'project_specific', match_reason: `Matched: client name '${project.client_name}'` };
  }

  for (const term of partialTerms(project.site_name ?? '')) {
    if (lower.includes(term.toLowerCase())) {
      return { match_type: 'project_specific', match_reason: `Partial match: site name fragment '${term}'` };
    }
  }
  for (const term of partialTerms(project.client_name ?? '')) {
    if (lower.includes(term.toLowerCase())) {
      return { match_type: 'project_specific', match_reason: `Partial match: client name fragment '${term}'` };
    }
  }

  return { match_type: 'area_intelligence', match_reason: 'No direct project identifiers found in article text' };
}

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

async function fetchFeedArticles(feedType: string, feedUrl: string): Promise<RawArticle[]> {
  const ARTICLES_PER_FEED = 50;

  if (feedType === 'google_news') {
    const articles = await searchArticles(feedUrl, ARTICLES_PER_FEED);
    return articles.map((a) => ({
      title: a.title,
      excerpt: a.description,
      url: a.url,
      source_name: a.source.name,
      published_at: a.publishedAt,
    }));
  }

  try {
    const feed = await rssParser.parseURL(feedUrl);
    return (feed.items ?? []).slice(0, ARTICLES_PER_FEED).map((item) => {
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

// ─── Scan endpoint — fetch and store only, NO analysis ───────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ensureUserInSupabase();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = params.id;

  try {
    return await runScan(projectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scan failed unexpectedly';
    console.error('[Project Scan] Unhandled error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function runScan(projectId: string) {
  const { data: project, error: projErr } = await supabaseAdmin
    .from('projects')
    .select('id, client_name, site_name, planning_reference, lpa, boolean_search_terms')
    .eq('id', projectId)
    .single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { data: projectFeeds } = await supabaseAdmin
    .from('feeds')
    .select('id, name, feed_type, url, is_active, last_fetched_at')
    .eq('project_id', projectId)
    .eq('is_active', true);

  const feedSources = (projectFeeds && projectFeeds.length > 0)
    ? projectFeeds.map((f) => ({
        type: f.feed_type,
        url: f.url,
        id: f.id,
        last_fetched_at: (f as Record<string, unknown>).last_fetched_at as string | null,
      }))
    : project.boolean_search_terms
      ? [{ type: 'google_news', url: project.boolean_search_terms, id: null as string | null, last_fetched_at: null as string | null }]
      : [];

  // Date cutoff: use last_fetched_at if available, otherwise 6 months ago
  const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
  const defaultCutoff = new Date(Date.now() - SIX_MONTHS_MS);

  if (feedSources.length === 0) {
    return NextResponse.json({
      message: 'No feeds or search terms configured for this project',
      feeds_scanned: 0, articles_found: 0, articles_fetched: 0,
      articles_matched: 0, articles_skipped_duplicate: 0,
      articles_skipped_irrelevant: 0, errors: [],
    });
  }

  const { data: existingArticles } = await supabaseAdmin
    .from('fetched_articles')
    .select('guid')
    .eq('project_id', projectId);

  const existingGuids = new Set((existingArticles ?? []).map((a) => a.guid));

  const result = {
    feeds_scanned: feedSources.length,
    articles_found: 0,
    articles_fetched: 0,
    articles_matched: 0,
    articles_skipped_duplicate: 0,
    articles_skipped_irrelevant: 0,
    errors: [] as string[],
  };

  // Fetch all feeds in parallel
  const feedResults = await Promise.allSettled(
    feedSources.map(async (feedSource) => {
      try {
        // For Google News, append date filter to narrow results
        let url = feedSource.url;
        if (feedSource.type === 'google_news') {
          const cutoff = feedSource.last_fetched_at
            ? new Date(feedSource.last_fetched_at)
            : defaultCutoff;
          const afterDate = cutoff.toISOString().split('T')[0];
          url = `${feedSource.url} after:${afterDate}`;
        }

        const rawArticles = await fetchFeedArticles(feedSource.type, url);
        return { feedSource, articles: rawArticles };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Feed fetch failed';
        return { feedSource, articles: [] as RawArticle[], error: msg };
      }
    })
  );

  const allArticles: Array<{ feedId: string | null; article: RawArticle }> = [];

  for (const feedResult of feedResults) {
    if (feedResult.status === 'rejected') {
      result.errors.push(feedResult.reason?.message ?? 'Feed fetch failed');
      continue;
    }

    const { feedSource, articles, error } = feedResult.value as {
      feedSource: typeof feedSources[0];
      articles: RawArticle[];
      error?: string;
    };

    if (error) result.errors.push(error);

    // Filter out articles older than cutoff date
    const cutoff = feedSource.last_fetched_at
      ? new Date(feedSource.last_fetched_at)
      : defaultCutoff;

    for (const article of articles) {
      if (article.published_at) {
        const pubDate = new Date(article.published_at);
        if (pubDate < cutoff) continue;
      }
      allArticles.push({ feedId: feedSource.id, article });
    }

    if (feedSource.id) {
      await supabaseAdmin
        .from('feeds')
        .update({ last_fetched_at: new Date().toISOString() })
        .eq('id', feedSource.id);
    }
  }

  result.articles_found = allArticles.length;

  // Store articles — no analysis, just classify and save
  for (const { feedId, article } of allArticles) {
    const guid = makeGuid(article.url, article.title);

    if (existingGuids.has(guid)) {
      result.articles_skipped_duplicate++;
      continue;
    }

    const text = [article.title, article.excerpt].filter(Boolean).join('\n\n');
    if (!text.trim()) continue;

    if (!hasPlanningRelevance(text)) {
      result.articles_skipped_irrelevant++;
      continue;
    }

    const { match_type, match_reason } = classifyMatch(text, project);
    const status = match_type === 'project_specific' ? 'matched' : 'pending';

    const { error: fetchErr } = await supabaseAdmin
      .from('fetched_articles')
      .insert({
        feed_id: feedId,
        project_id: projectId,
        title: article.title,
        excerpt: article.excerpt,
        url: article.url,
        source_name: article.source_name,
        published_at: article.published_at,
        guid,
        matched_by: match_reason,
        status,
      });

    if (fetchErr) {
      if (fetchErr.code === '23505') {
        result.articles_skipped_duplicate++;
      } else {
        result.errors.push(`${article.title}: ${fetchErr.message}`);
      }
      continue;
    }

    existingGuids.add(guid);
    result.articles_fetched++;
    if (match_type === 'project_specific') result.articles_matched++;
  }

  const message = `Scan complete. ${result.articles_fetched} new articles from ${result.articles_found} found across ${result.feeds_scanned} feeds. ${result.articles_matched} project-specific matches, ${result.articles_skipped_duplicate} duplicates skipped.`;

  return NextResponse.json({ message, ...result });
}
