import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { extract } from '@/lib/articleExtractor';
import { ensureUserInSupabase } from '@/lib/auth';
import { canonicaliseUrl } from '@/lib/urlCanonicalise';
import { compileMatcher, type Matcher } from '@/lib/booleanMatcher';
import {
  feedSources,
  PER_SOURCE_LIMITS,
  type FeedSource,
  type RawArticle,
} from '@/lib/feedSources';
import type { MatchType } from '@/lib/types';

export const maxDuration = 120;

// 3 (down from 5) to reduce concurrent load on Google's batchexecute
// endpoint used by the Google News URL decoder. Each extract now does up
// to 3 outbound fetches (sig/timestamp scrape + batchexecute + publisher),
// so concurrency 5 was at risk of soft-throttling on busy scans.
const EXTRACT_CONCURRENCY = 3;

// Module-scoped per-source rate limiter. Same pattern as articleExtractor's
// per-host throttle. Persists across calls within a single Vercel function
// instance; resets on cold start (acceptable for manual scans).
const sourceNextAllowedAt = new Map<string, number>();

async function gateOnSource(source: FeedSource): Promise<void> {
  if (!source.rateLimitMs) return;
  const now = Date.now();
  const wait = sourceNextAllowedAt.get(source.id) ?? 0;
  if (wait > now) {
    await new Promise((r) => setTimeout(r, wait - now));
  }
  sourceNextAllowedAt.set(source.id, Math.max(wait, Date.now()) + source.rateLimitMs);
}

function textOf(item: RawArticle): string {
  return `${item.title}\n${item.description ?? ''}`;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface Candidate {
  title: string;
  url: string;
  source_text: string;
  matchType: MatchType;
  feedSourceId: string;
}

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

  // Cross-source dedup: keyed on canonicalised URL so the same article
  // surfaced by Google News (with utm_*) and BBC (clean) doesn't double-insert.
  const { data: existingItems } = await supabaseAdmin
    .from('analysis_items')
    .select('source_url')
    .not('source_url', 'is', null);

  const seenCanonical = new Set<string>(
    (existingItems ?? [])
      .map((i) => canonicaliseUrl(i.source_url))
      .filter((u): u is string => !!u)
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

    const projectTerms = project.boolean_search_terms?.trim() ?? '';
    const clientTerms = project.client_search_terms?.trim() ?? '';

    if (!projectTerms && !clientTerms) {
      projectResult.errors.push('No search terms configured');
      results.push(projectResult);
      continue;
    }

    // Compile matchers once per project per scan (Phase 2 wiring confirmation).
    // Default to matches-nothing on parse error or empty terms so browse
    // sources don't flood the queue with un-filtered items.
    let projectMatcher: Matcher = () => false;
    let clientMatcher: Matcher = () => false;
    if (projectTerms) {
      try {
        projectMatcher = compileMatcher(projectTerms);
      } catch (err) {
        projectResult.errors.push(`Project search query parse error: ${errMsg(err)}`);
      }
    }
    if (clientTerms) {
      try {
        clientMatcher = compileMatcher(clientTerms);
      } catch (err) {
        projectResult.errors.push(`Client search query parse error: ${errMsg(err)}`);
      }
    }

    const candidates: Candidate[] = [];

    const addCandidate = (
      item: RawArticle,
      matchType: MatchType,
      feedSourceId: string
    ): void => {
      if (!item.url) return;
      const canonical = canonicaliseUrl(item.url) ?? item.url;
      if (seenCanonical.has(canonical)) return;
      const sourceText = [item.title, item.description, item.content]
        .filter(Boolean)
        .join('\n\n');
      if (!sourceText.trim()) return;
      seenCanonical.add(canonical);
      candidates.push({
        title: item.title,
        url: item.url,
        source_text: sourceText,
        matchType,
        feedSourceId,
      });
    };

    // Loop sources in registry order: direct publishers (Oxford Mail,
    // Banbury) first, then query aggregators (Google News, Bing News).
    // Cross-source dedup resolves duplicates to whichever source wins
    // the race — i.e. the publisher feed.
    for (const source of feedSources) {
      await gateOnSource(source);
      const cap = PER_SOURCE_LIMITS[source.id] ?? 10;

      try {
        if (source.kind === 'query') {
          const queryPairs: Array<{ terms: string; matchType: MatchType }> = [];
          if (projectTerms) queryPairs.push({ terms: projectTerms, matchType: 'project' });
          if (clientTerms) queryPairs.push({ terms: clientTerms, matchType: 'client' });

          for (const { terms, matchType } of queryPairs) {
            const items = await source.fetch(terms, cap);
            projectResult.articles_found += items.length;
            for (const item of items) {
              addCandidate(item, matchType, source.id);
            }
          }
        } else {
          // Browse: fetch once, drop affiliate items via source.filter,
          // then classify remaining items against project/client matchers,
          // then cap.
          let items = await source.fetch();
          if (source.filter) items = items.filter(source.filter);
          projectResult.articles_found += items.length;

          let kept = 0;
          for (const item of items) {
            if (kept >= cap) break;
            const text = textOf(item);
            let matchType: MatchType | null = null;
            if (projectMatcher(text)) matchType = 'project';
            else if (clientMatcher(text)) matchType = 'client';
            if (!matchType) continue;
            addCandidate(item, matchType, source.id);
            kept++;
          }
        }
      } catch (err) {
        projectResult.errors.push(`[${source.id}] ${errMsg(err)}`);
      }
    }

    // Extract full article text in parallel, capped at EXTRACT_CONCURRENCY.
    // No Claude calls inline — analysis is deferred to /api/analyse-pending.
    // extract() unwraps Google News redirect URLs to the publisher URL
    // before fetching; non-Google URLs (BBC, Oxford Mail, Bing redirect)
    // pass through unwrap unchanged. On unwrap or fetch failure the row
    // is still inserted with extraction_status='failed' and the worker
    // analyses the RSS snippet (source_text). Same fallback path as the
    // paywalled case.
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

        // Fall back to the original URL when unwrap failed entirely. Keeps
        // source_url non-null so the canonical-URL dedup set still catches
        // re-scans of the same wrapped URL.
        const sourceUrl = publisherUrl ?? candidate.url;

        // Post-unwrap dedup: the unwrapped publisher URL might already be
        // in the set under a different pre-unwrap form (e.g. another scan
        // already ingested the same article via a different source). Catch
        // that here, after we've paid for the unwrap. Keyed on canonical.
        if (publisherUrl) {
          const canonicalPub = canonicaliseUrl(publisherUrl) ?? publisherUrl;
          if (seenCanonical.has(canonicalPub) && canonicalPub !== (canonicaliseUrl(candidate.url) ?? candidate.url)) {
            continue;
          }
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
              feed_source_id: candidate.feedSourceId,
              review_status: 'unreviewed',
              analysis_status: 'pending',
              created_by: userId,
            });

          if (insertError) {
            projectResult.errors.push(
              `[${candidate.feedSourceId}/${candidate.matchType}] insert failed for "${candidate.title}": ${insertError.message}`
            );
            continue;
          }

          const canonicalSrc = canonicaliseUrl(sourceUrl) ?? sourceUrl;
          seenCanonical.add(canonicalSrc);
          projectResult.articles_ingested++;
          projectResult.pending_count++;
          if (candidate.matchType === 'project') projectResult.project_matches++;
          else projectResult.client_matches++;
        } catch (err) {
          projectResult.errors.push(`[${candidate.feedSourceId}/${candidate.matchType}] ${errMsg(err)}`);
        }
      }
    }

    results.push(projectResult);

    // Inter-project delay. Now arguably redundant given per-source rate
    // limiting, but harmless and protects against bursting Google when
    // scanning many projects in one go.
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
