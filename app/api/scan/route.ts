import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { searchArticles } from '@/lib/google-news-rss';
import { analyseContent } from '@/lib/anthropic';
import { ensureUserInSupabase } from '@/lib/auth';

export const maxDuration = 60;

const ARTICLES_PER_QUERY = 5;
type MatchType = 'project' | 'client';

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

    for (const { terms, matchType } of queries) {
      try {
        const articles = await searchArticles(terms, ARTICLES_PER_QUERY);
        projectResult.articles_found += articles.length;

        for (const article of articles) {
          if (existingUrls.has(article.url)) continue;

          const text = [article.title, article.description, article.content]
            .filter(Boolean)
            .join('\n\n');

          if (!text.trim()) continue;

          try {
            const analysis = await analyseContent(text);

            await supabaseAdmin.from('analysis_items').insert({
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
              match_type: matchType,
              created_by: userId,
            });

            existingUrls.add(article.url);
            projectResult.articles_ingested++;
            if (matchType === 'project') projectResult.project_matches++;
            else projectResult.client_matches++;
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Analysis failed';
            projectResult.errors.push(`[${matchType}] ${article.title}: ${msg}`);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Feed fetch failed';
        projectResult.errors.push(`[${matchType}] ${msg}`);
      }
    }

    results.push(projectResult);

    // Delay between projects to avoid rate limiting from Google (only relevant for multi-project scans)
    if (projects.length > 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  const totalIngested = results.reduce((sum, r) => sum + r.articles_ingested, 0);

  return NextResponse.json({
    message: `Scan complete. ${totalIngested} new article(s) ingested.`,
    results,
  });
}
