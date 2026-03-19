import Parser from 'rss-parser';
import { getFeedsForLpa } from '@/lib/feedSources';
import { supabaseAdmin } from '@/lib/supabase/server';

const FEED_TIMEOUT_MS = 8_000;

const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
});

interface ProjectInput {
  id: string;
  lpa: string;
  boolean_search_terms: string;
  client_name: string;
  site_name: string;
  planning_reference: string | null;
}

/**
 * Extract individual search terms from a boolean search string.
 * Strips AND / OR / NOT operators and surrounding quotes,
 * then returns lowercased terms suitable for substring matching.
 */
function extractMatchTerms(project: ProjectInput): string[] {
  const terms: string[] = [];

  // Parse boolean_search_terms: strip operators, extract quoted phrases and bare words
  const raw = project.boolean_search_terms;
  if (raw) {
    // Extract quoted phrases first
    const quoted = raw.match(/"([^"]+)"/g);
    if (quoted) {
      for (const q of quoted) {
        terms.push(q.replace(/"/g, ''));
      }
    }
    // Then get remaining tokens after removing quoted parts and boolean operators
    const stripped = raw
      .replace(/"[^"]+"/g, '')
      .replace(/\b(AND|OR|NOT)\b/gi, '')
      .trim();
    for (const token of stripped.split(/\s+/)) {
      if (token.length > 2) {
        terms.push(token);
      }
    }
  }

  // Always include project identifiers as match terms
  if (project.client_name) terms.push(project.client_name);
  if (project.site_name) terms.push(project.site_name);
  if (project.planning_reference) terms.push(project.planning_reference);

  // Deduplicate and lowercase
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of terms) {
    const lower = t.toLowerCase().trim();
    if (lower && !seen.has(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }
  return result;
}

function isRelevant(
  title: string,
  description: string,
  matchTerms: string[]
): boolean {
  const haystack = `${title} ${description}`.toLowerCase();
  return matchTerms.some((term) => haystack.includes(term));
}

/**
 * Stage 1: Fetch RSS feeds, filter for relevance, and save matching articles
 * as pending_analysis. No Anthropic API calls — analysis happens in Stage 2
 * via /api/analyse-pending.
 */
export async function ingestFeedsForProject(
  project: ProjectInput,
  createdBy = 'system'
): Promise<{ ingested: number; skipped: number; errors: string[] }> {
  const feeds = getFeedsForLpa(project.lpa);
  const matchTerms = extractMatchTerms(project);
  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (feeds.length === 0) {
    return { ingested, skipped, errors };
  }

  // Pre-fetch existing URLs for this project to avoid per-article queries
  const { data: existingRows } = await supabaseAdmin
    .from('analysis_items')
    .select('source_url')
    .eq('project_id', project.id)
    .eq('source_type', 'rss-local');

  const existingUrls = new Set<string>(
    (existingRows ?? [])
      .map((r) => r.source_url)
      .filter((u): u is string => u !== null)
  );

  for (const feed of feeds) {
    let items: Parser.Item[];
    try {
      const parsed = await parser.parseURL(feed.url);
      items = parsed.items ?? [];
      console.log(`[RSS] Feed "${feed.name}" returned ${items.length} items (before relevance filter)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Feed fetch failed';
      if (msg.includes('timed out')) {
        console.warn(`[RSS] Feed "${feed.name}" timed out after ${FEED_TIMEOUT_MS}ms — skipping`);
      }
      errors.push(`[${feed.name}] ${msg}`);
      continue;
    }

    for (const item of items) {
      const title = item.title ?? '';
      const description = item.contentSnippet || item.content || '';
      const articleUrl = item.link ?? '';

      if (!articleUrl) {
        skipped++;
        continue;
      }

      if (!isRelevant(title, description, matchTerms)) {
        skipped++;
        continue;
      }

      if (existingUrls.has(articleUrl)) {
        skipped++;
        continue;
      }

      const sourceText = `${title}\n\n${description}`.slice(0, 5000);

      try {
        const row = {
          project_id: project.id,
          source_text: sourceText,
          source_type: 'rss-local',
          source_url: articleUrl,
          source_name: feed.name,
          published_at: item.pubDate ?? null,
          review_status: 'pending_analysis',
          created_by: createdBy,
        };

        if (ingested === 0 && errors.length === 0) {
          console.log('[RSS] First insert payload:', JSON.stringify(row, null, 2));
        }

        const { error: insertError } = await supabaseAdmin
          .from('analysis_items')
          .insert(row);

        if (insertError) {
          console.error('[RSS] Supabase insert error:', JSON.stringify(insertError, null, 2));
          errors.push(`[${feed.name}] "${title}": ${insertError.message}`);
          continue;
        }

        existingUrls.add(articleUrl);
        ingested++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Insert failed';
        errors.push(`[${feed.name}] "${title}": ${msg}`);
      }
    }
  }

  return { ingested, skipped, errors };
}
