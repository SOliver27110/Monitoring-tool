import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { searchArticles } from '@/lib/google-news-rss';
import { analyseContent } from '@/lib/anthropic';
import { ensureUserInSupabase } from '@/lib/auth';

export const maxDuration = 60;

function classifyMatch(
  text: string,
  project: { client_name: string; site_name: string; planning_reference: string }
): { match_type: 'project_specific' | 'area_intelligence'; match_reason: string } {
  const lower = text.toLowerCase();

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

  return {
    match_type: 'area_intelligence',
    match_reason: 'No direct project identifiers found in article text',
  };
}

export async function POST() {
  const userId = await ensureUserInSupabase();

  // Fetch all projects with boolean search terms
  const { data: projects, error: projErr } = await supabaseAdmin
    .from('projects')
    .select('id, client_name, site_name, planning_reference, lpa, boolean_search_terms');

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ message: 'No projects to scan', results: [] });
  }

  // Get existing source URLs to avoid duplicates
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
    errors: string[];
  }> = [];

  for (const project of projects) {
    const query = project.boolean_search_terms;
    if (!query) {
      results.push({
        project_id: project.id,
        project_name: `${project.client_name} – ${project.site_name}`,
        articles_found: 0,
        articles_ingested: 0,
        errors: ['No search terms configured'],
      });
      continue;
    }

    const projectResult = {
      project_id: project.id,
      project_name: `${project.client_name} – ${project.site_name}`,
      articles_found: 0,
      articles_ingested: 0,
      errors: [] as string[],
    };

    try {
      const articles = await searchArticles(query, 10);
      projectResult.articles_found = articles.length;

      for (const article of articles) {
        // Skip duplicates
        if (existingUrls.has(article.url)) continue;

        // Build the text content for analysis
        const text = [
          article.title,
          article.description,
          article.content,
        ]
          .filter(Boolean)
          .join('\n\n');

        if (!text.trim()) continue;

        try {
          const { match_type, match_reason } = classifyMatch(text, project);
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
            match_type,
            match_reason,
            created_by: userId,
          });

          existingUrls.add(article.url);
          projectResult.articles_ingested++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Analysis failed';
          projectResult.errors.push(`${article.title}: ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Feed fetch failed';
      projectResult.errors.push(msg);
    }

    results.push(projectResult);

    // Delay between projects to avoid rate limiting from Google
    await new Promise((r) => setTimeout(r, 1500));
  }

  const totalIngested = results.reduce((sum, r) => sum + r.articles_ingested, 0);

  return NextResponse.json({
    message: `Scan complete. ${totalIngested} new article(s) ingested.`,
    results,
  });
}
