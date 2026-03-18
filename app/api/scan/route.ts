import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { searchArticles, type NewsApiArticle } from '@/lib/newsapi';
import { analyseContent } from '@/lib/anthropic';
import { ensureUserInSupabase } from '@/lib/auth';

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProjectRow {
  id: string;
  client_name: string;
  site_name: string;
  planning_reference: string | null;
  lpa: string;
  boolean_search_terms: string;
  exclusion_terms: string | null;
}

interface UniqueArticle {
  article: NewsApiArticle;
  text: string; // title + description + content combined
}

interface ProjectMatch {
  project_id: string;
  matched_by: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Split a comma-separated string into trimmed, non-empty terms. */
function splitTerms(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Case-insensitive substring check. */
function textContains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * Match a single article's text against a single project.
 * Returns the matched_by reason, or null if no match (or excluded).
 */
function matchArticleToProject(
  textLower: string,
  project: ProjectRow
): string | null {
  let matched_by: string | null = null;

  // Rule 1: planning_reference
  if (project.planning_reference && project.planning_reference.trim()) {
    if (textLower.includes(project.planning_reference.trim().toLowerCase())) {
      matched_by = 'planning_ref';
    }
  }

  // Rule 2: site_name
  if (!matched_by && project.site_name) {
    if (textLower.includes(project.site_name.toLowerCase())) {
      matched_by = 'site_name';
    }
  }

  // Rule 3: client_name AND lpa
  if (!matched_by && project.client_name && project.lpa) {
    if (
      textLower.includes(project.client_name.toLowerCase()) &&
      textLower.includes(project.lpa.toLowerCase())
    ) {
      matched_by = 'client_lpa';
    }
  }

  // Rule 4: any individual boolean_search_terms term
  if (!matched_by) {
    const terms = splitTerms(project.boolean_search_terms);
    for (const term of terms) {
      if (textLower.includes(term.toLowerCase())) {
        matched_by = 'boolean_terms';
        break;
      }
    }
  }

  // Rule 5: exclusion — if matched but an exclusion term also appears, reject
  if (matched_by) {
    const exclusions = splitTerms(project.exclusion_terms);
    for (const ex of exclusions) {
      if (textLower.includes(ex.toLowerCase())) {
        return null;
      }
    }
  }

  return matched_by;
}

// ---------------------------------------------------------------------------
// POST /api/scan
// ---------------------------------------------------------------------------

export async function POST() {
  const userId = await ensureUserInSupabase();

  // =========================================================================
  // Stage 1 — Fetch and deduplicate
  // =========================================================================

  const { data: projects, error: projErr } = await supabaseAdmin
    .from('projects')
    .select(
      'id, client_name, site_name, planning_reference, lpa, boolean_search_terms, exclusion_terms'
    );

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ message: 'No projects to scan', stats: null });
  }

  // Existing URLs in analysis_items — skip these entirely
  const { data: existingItems } = await supabaseAdmin
    .from('analysis_items')
    .select('source_url')
    .not('source_url', 'is', null);

  const existingUrls = new Set(
    (existingItems ?? []).map((i: { source_url: string | null }) => i.source_url).filter(Boolean)
  );

  // Fetch articles for every project, collect into a URL-keyed map
  const articlesByUrl = new Map<string, UniqueArticle>();
  let totalFetched = 0;
  const fetchErrors: string[] = [];

  for (const project of projects as ProjectRow[]) {
    if (!project.boolean_search_terms) continue;

    try {
      const articles = await searchArticles(project.boolean_search_terms, 10);
      totalFetched += articles.length;

      for (const article of articles) {
        if (existingUrls.has(article.url)) continue;
        if (articlesByUrl.has(article.url)) continue;

        const text = [article.title, article.description, article.content]
          .filter(Boolean)
          .join('\n\n');

        if (!text.trim()) continue;

        articlesByUrl.set(article.url, { article, text });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'NewsAPI fetch failed';
      fetchErrors.push(`${project.client_name}: ${msg}`);
    }
  }

  const uniqueArticles = Array.from(articlesByUrl.values());

  // =========================================================================
  // Stage 2 — Match each article against ALL projects
  // =========================================================================

  const articleMatches = new Map<string, ProjectMatch[]>(); // url → matches

  for (const { article, text } of uniqueArticles) {
    const textLower = text.toLowerCase();
    const matches: ProjectMatch[] = [];

    for (const project of projects as ProjectRow[]) {
      const matched_by = matchArticleToProject(textLower, project);
      if (matched_by) {
        matches.push({ project_id: project.id, matched_by });
      }
    }

    if (matches.length > 0) {
      articleMatches.set(article.url, matches);
    }
  }

  // =========================================================================
  // Stage 3 — Analyse and save
  // =========================================================================

  let analysedCount = 0;
  let multiMatchCount = 0;
  const analyseErrors: string[] = [];

  for (const { article, text } of uniqueArticles) {
    const matches = articleMatches.get(article.url);
    if (!matches || matches.length === 0) continue;

    if (matches.length > 1) multiMatchCount++;

    try {
      // Call Anthropic ONCE per unique article
      const analysis = await analyseContent(text);

      // Insert one row per matched project
      for (const match of matches) {
        await supabaseAdmin.from('analysis_items').insert({
          project_id: match.project_id,
          source_text: text,
          source_type: 'news_article',
          source_url: article.url,
          summary: analysis.summary,
          sentiment: analysis.sentiment,
          alert_level: analysis.alert_level,
          notable_voices: analysis.notable_voices,
          key_themes: analysis.key_themes,
          recommended_action: analysis.recommended_action,
          matched_by: match.matched_by,
          review_status: 'unreviewed',
          created_by: userId,
        });
      }

      analysedCount++;
      existingUrls.add(article.url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      analyseErrors.push(`${article.title}: ${msg}`);
    }
  }

  // =========================================================================
  // Response
  // =========================================================================

  const matchedCount = articleMatches.size;

  const stats = {
    total_fetched: totalFetched,
    unique_after_dedup: uniqueArticles.length,
    matched_at_least_one_project: matchedCount,
    matched_multiple_projects: multiMatchCount,
    analysed: analysedCount,
  };

  const errors = [...fetchErrors, ...analyseErrors];

  return NextResponse.json({
    message: `Scan complete. ${analysedCount} article(s) analysed, ${matchedCount} matched.`,
    stats,
    errors: errors.length > 0 ? errors : undefined,
  });
}
