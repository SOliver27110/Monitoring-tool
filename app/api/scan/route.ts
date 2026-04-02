import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { searchArticles } from '@/lib/google-news-rss';
import { ensureUserInSupabase } from '@/lib/auth';

export const maxDuration = 60;

export async function POST() {
  const userId = await ensureUserInSupabase();

  // Fetch all projects with boolean search terms
  const { data: projects, error: projErr } = await supabaseAdmin
    .from('projects')
    .select('id, client_name, site_name, lpa, boolean_search_terms, last_scanned_at');

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ message: 'No projects to scan', results: [], pending: 0 });
  }

  // Get existing source URLs to avoid duplicates
  const { data: existingItems } = await supabaseAdmin
    .from('analysis_items')
    .select('source_url')
    .not('source_url', 'is', null);

  const existingUrls = new Set(
    (existingItems ?? []).map((i) => i.source_url).filter(Boolean)
  );

  const PLANNING_CONTEXT_WORDS = [
    'planning', 'development', 'homes', 'housing', 'application',
    'proposal', 'construction', 'building', 'consent', 'permission',
  ];
  const LPA_STOP_WORDS = ['council', 'borough', 'district', 'county', 'city', 'authority'];

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function wordMatch(haystack: string, term: string): boolean {
    return new RegExp('\\b' + escapeRegex(term) + '\\b', 'i').test(haystack);
  }

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

    let feedFetchOk = false;
    try {
      const after = project.last_scanned_at
        ? new Date(project.last_scanned_at)
        : undefined;
      const articles = await searchArticles(query, 20, after);
      feedFetchOk = true;
      projectResult.articles_found = articles.length;

      for (const article of articles) {
        if (existingUrls.has(article.url)) continue;

        const text = [article.title, article.description, article.content]
          .filter(Boolean)
          .join('\n\n');

        if (!text.trim()) continue;

        // Local relevance filter: require EITHER the client name (word-boundary)
        // OR (LPA name + a planning-context keyword). Articles matching neither
        // the client nor the LPA are skipped — they are generic area intel, not
        // project-specific matches.
        const lower = text.toLowerCase();
        const clientAppears =
          project.client_name &&
          wordMatch(lower, project.client_name.toLowerCase());
        if (!clientAppears) {
          const lpaShort = project.lpa
            .split(' ')
            .filter((w: string) => !LPA_STOP_WORDS.includes(w.toLowerCase()))
            .join(' ')
            .trim();
          const lpaAppears = lpaShort && wordMatch(lower, lpaShort.toLowerCase());
          if (!lpaAppears) continue;

          const hasPlanningContext = PLANNING_CONTEXT_WORDS.some((w) =>
            wordMatch(lower, w)
          );
          if (!hasPlanningContext) continue;
        }

        try {
          await supabaseAdmin.from('analysis_items').insert({
            project_id: project.id,
            source_text: text,
            source_type: 'news_article',
            source_url: article.url,
            source_name: article.source.name,
            published_at: article.publishedAt,
            review_status: 'pending_analysis',
            created_by: userId,
          });

          existingUrls.add(article.url);
          projectResult.articles_ingested++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Insert failed';
          projectResult.errors.push(`${article.title}: ${msg}`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Feed fetch failed';
      projectResult.errors.push(msg);
    }

    if (feedFetchOk) {
      await supabaseAdmin
        .from('projects')
        .update({ last_scanned_at: new Date().toISOString() })
        .eq('id', project.id);
    }

    results.push(projectResult);

    // Delay between projects to avoid rate limiting from Google
    await new Promise((r) => setTimeout(r, 1500));
  }

  const totalIngested = results.reduce((sum, r) => sum + r.articles_ingested, 0);

  return NextResponse.json({
    message: `Scan complete. ${totalIngested} new article(s) found.`,
    results,
    pending: totalIngested,
  });
}
