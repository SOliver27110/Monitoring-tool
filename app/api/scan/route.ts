import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { searchArticles } from '@/lib/google-news-rss';
import { extract } from '@/lib/articleExtractor';
import { ensureUserInSupabase } from '@/lib/auth';
import type { MatchType } from '@/lib/types';

export const maxDuration = 120;

const ARTICLES_PER_QUERY = 15;
// 3 (down from 5) to reduce concurrent load on Google's batchexecute
// endpoint used by the Google News URL decoder. Each extract now does up
// to 3 outbound fetches (sig/timestamp scrape + batchexecute + publisher),
// so concurrency 5 was at risk of soft-throttling on busy scans.
const EXTRACT_CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  const userId = await ensureUserInSupabase();

  let body: { project_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine — scan all projects
  }
  const requestedProjectId = typeof body.project_id === 'string' ? body.project_id : undefined;

  let projectsQuery = supabaseAdmin
    .from('projects')
    .select('id, client_name, site_name, boolean_search_terms, client_search_terms');

  if (requestedProjectId) {
    projectsQuery = projectsQuery.eq('id', requestedProjectId);
  }

  const { data: projects, error: projErr } = await projectsQuery;

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ message: 'No projects to scan', results: [] });
  }

  const { data: existingItems } = await supabaseAdmin
    .from('analysis_items')
    .select('source_url')
    .not('source_url', 'is', null);

  const existingUrls = new Set(
    (existingItems ?? []).map((i) => i.source_url).filter(Boolean)
  );

  const results: Array<{
    project_id: string;
    project_name: string;
    articles_found: number;
    articles_ingested: number;
    project_matches: number;
    client_matches: number;
    pending_count: number;
    errors: string[];
  }> = [];

  for (const project of projects) {
    const projectResult = {
      project_id: project.id,
      project_name: `${project.client_name} – ${project.site_name}`,
      articles_found: 0,
      articles_ingested: 0,
      project_matches: 0,
      client_matches: 0,
      pending_count: 0,
      errors: [] as string[],
    };

    const queries: Array<{ terms: string; matchType: MatchType }> = [];
    if (project.boolean_search_terms?.trim()) {
      queries.push({ terms: project.boolean_search_terms, matchType: 'project' });
    }
    if (project.client_search_terms?.trim()) {
      queries.push({ terms: project.client_search_terms, matchType: 'client' });
    }

    if (queries.length === 0) {
      projectResult.errors.push('No search terms configured');
      results.push(projectResult);
      continue;
    }

    // Collect candidate articles across both queries, deduping within this
    // scan so a URL that matches both queries is tagged 'project' (project
    // query runs first).
    const candidates: Array<{
      title: string;
      url: string;
      source_text: string;
      matchType: MatchType;
    }> = [];

    for (const { terms, matchType } of queries) {
      try {
        const articles = await searchArticles(terms, ARTICLES_PER_QUERY);
        projectResult.articles_found += articles.length;

        for (const article of articles) {
          if (existingUrls.has(article.url)) continue;
          if (candidates.some((c) => c.url === article.url)) continue;

          const sourceText = [article.title, article.description, article.content]
            .filter(Boolean)
            .join('\n\n');

          if (!sourceText.trim()) continue;

          candidates.push({
            title: article.title,
            url: article.url,
            source_text: sourceText,
            matchType,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Feed fetch failed';
        projectResult.errors.push(`[${matchType}] ${msg}`);
      }
    }

    // Extract full article text in parallel, capped at EXTRACT_CONCURRENCY.
    // No Claude calls inline — analysis is deferred to /api/analyse-pending.
    // extract() unwraps Google News redirect URLs to the publisher URL
    // before fetching; on unwrap or fetch failure the row is still inserted
    // with extraction_status='failed' and the worker analyses the RSS
    // snippet (source_text). Same fallback path as the paywalled case.
    for (let i = 0; i < candidates.length; i += EXTRACT_CONCURRENCY) {
      const chunk = candidates.slice(i, i + EXTRACT_CONCURRENCY);
      const extractResults = await Promise.allSettled(
        chunk.map((c) => extract(c.url))
      );

      for (let j = 0; j < chunk.length; j++) {
        const candidate = chunk[j];
        const extractResult = extractResults[j];

        let fullText: string | null = null;
        let extractionStatus: 'success' | 'failed' | 'paywalled' = 'failed';
        let publisherUrl: string | null = null;

        if (extractResult.status === 'fulfilled') {
          fullText = extractResult.value.text;
          extractionStatus = extractResult.value.status;
          publisherUrl = extractResult.value.publisher_url;
        }
        // If rejected, keep the defaults. articleExtractor.extract() is
        // written not to throw, so this is belt-and-braces.

        // Fall back to the original (Google News redirect) URL when unwrap
        // failed entirely. Keeps source_url non-null so the dedup set still
        // catches re-scans of the same wrapped URL.
        const sourceUrl = publisherUrl ?? candidate.url;

        // Post-unwrap dedup: a different RSS query (or a different feed
        // source in Batch C) might have surfaced the same publisher URL.
        // Catch that here, after we've paid for the unwrap.
        if (publisherUrl && existingUrls.has(publisherUrl)) {
          continue;
        }

        try {
          const { error: insertError } = await supabaseAdmin
            .from('analysis_items')
            .insert({
              project_id: project.id,
              source_text: candidate.source_text,
              source_type: 'news_article',
              source_url: sourceUrl,
              original_source_url: candidate.url,
              full_text: fullText,
              extraction_status: extractionStatus,
              match_type: candidate.matchType,
              review_status: 'unreviewed',
              analysis_status: 'pending',
              created_by: userId,
            });

          if (insertError) {
            projectResult.errors.push(
              `[${candidate.matchType}] insert failed for "${candidate.title}": ${insertError.message}`
            );
            continue;
          }

          existingUrls.add(sourceUrl);
          existingUrls.add(candidate.url);
          projectResult.articles_ingested++;
          projectResult.pending_count++;
          if (candidate.matchType === 'project') projectResult.project_matches++;
          else projectResult.client_matches++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Insert failed';
          projectResult.errors.push(`[${candidate.matchType}] ${msg}`);
        }
      }
    }

    results.push(projectResult);

    // Delay between projects to avoid rate limiting from Google (only
    // relevant for multi-project scans).
    if (projects.length > 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const totalIngested = results.reduce((sum, r) => sum + r.articles_ingested, 0);

  return NextResponse.json({
    message: `Scan complete. ${totalIngested} new article(s) ingested (awaiting analysis).`,
    results,
  });
}
