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

/** Words stripped from site names before matching — too generic to be useful. */
const GENERIC_SITE_WORDS = new Set([
  'road', 'street', 'lane', 'way', 'close', 'drive', 'avenue',
  'land', 'north', 'south', 'east', 'west',
  'at', 'the', 'of', 'off', 'near',
  'site', 'plot', 'phase', 'former', 'proposed',
]);

/** Planning-context keywords — at least one must appear for Condition B. */
const PLANNING_KEYWORDS = [
  'planning', 'development', 'application', 'permission',
  'housing', 'proposal', 'appeal', 'committee',
  'councillor', 'objection', 'consultation', 'developer',
  'housebuilder', 'refused', 'allocated',
];

/**
 * Build the list of specific project terms used for Condition A.
 * Includes: planning reference, client name, and meaningful site-name parts
 * (generic words like "road", "street" etc. are stripped).
 */
function extractSpecificTerms(project: ProjectInput): string[] {
  const terms: string[] = [];

  if (project.planning_reference) {
    terms.push(project.planning_reference.toLowerCase().trim());
  }

  if (project.client_name) {
    terms.push(project.client_name.toLowerCase().trim());
  }

  if (project.site_name) {
    const parts = project.site_name.toLowerCase().split(/\s+/);
    for (const part of parts) {
      const cleaned = part.replace(/[^a-z0-9]/g, '');
      if (cleaned.length > 2 && !GENERIC_SITE_WORDS.has(cleaned)) {
        terms.push(cleaned);
      }
    }
  }

  // Deduplicate
  return [...new Set(terms)];
}

/** Escape special regex characters so a literal string can be used in a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Test whether `term` appears in `haystack` as a whole word (word-boundary match). */
function wordMatch(haystack: string, term: string): boolean {
  return new RegExp('\\b' + escapeRegex(term) + '\\b', 'i').test(haystack);
}

/**
 * Two-part relevance test. An article passes only when BOTH conditions hold:
 *   A) Contains a specific project term (planning ref, client name, or
 *      meaningful site-name part) as a whole word.
 *   B) Contains at least one planning-context keyword as a whole word.
 *
 * The LPA city name alone is never sufficient.
 */
function isRelevant(
  title: string,
  description: string,
  specificTerms: string[]
): boolean {
  const haystack = `${title} ${description}`;

  // Condition A — specific project term match (word-boundary)
  const hasSpecificTerm = specificTerms.some((term) => wordMatch(haystack, term));
  if (!hasSpecificTerm) return false;

  // Condition B — planning context present (word-boundary)
  const hasPlanningContext = PLANNING_KEYWORDS.some((kw) => wordMatch(haystack, kw));
  return hasPlanningContext;
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
  const specificTerms = extractSpecificTerms(project);
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

      if (!isRelevant(title, description, specificTerms)) {
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
