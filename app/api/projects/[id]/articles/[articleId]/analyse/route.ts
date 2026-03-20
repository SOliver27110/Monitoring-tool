import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyseContent, NEEDS_REVIEW_THRESHOLD } from '@/lib/anthropic';
import { extractArticleText } from '@/lib/article-extractor';
import { waitForDomain } from '@/lib/rate-limiter';
import { ensureUserInSupabase } from '@/lib/auth';

export const maxDuration = 45;

function isConfirmedMatch(matchedBy: string | null): boolean {
  if (!matchedBy) return false;
  return matchedBy.includes('site name') || matchedBy.includes('client name');
}

/**
 * POST /api/projects/[id]/articles/[articleId]/analyse
 * Analyse a single fetched article with Claude Haiku, create an analysis_item,
 * and mark it as approved in one step.
 *
 * Body: { action: "approve" | "dismiss" }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; articleId: string } }
) {
  let userId: string;
  try {
    userId = await ensureUserInSupabase();
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = params.id;
  const articleId = params.articleId;

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = body.action ?? 'approve';

  // Fetch the article
  const { data: articleRow, error: artErr } = await supabaseAdmin
    .from('fetched_articles')
    .select('*')
    .eq('id', articleId)
    .eq('project_id', projectId)
    .single();

  if (artErr || !articleRow) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  const article = articleRow as {
    id: string;
    title: string;
    excerpt: string | null;
    url: string | null;
    matched_by: string | null;
  };

  // If dismissing, just update status and return
  if (action === 'dismiss') {
    await supabaseAdmin
      .from('fetched_articles')
      .update({ status: 'dismissed' })
      .eq('id', articleId);

    return NextResponse.json({ message: 'Article dismissed' });
  }

  // Fetch project context for enriched analysis
  const { data: projectRow } = await supabaseAdmin
    .from('projects')
    .select('site_name, planning_reference, client_name')
    .eq('id', projectId)
    .single();

  const projectContext = projectRow
    ? {
        site_name: projectRow.site_name,
        planning_reference: projectRow.planning_reference,
        client_name: projectRow.client_name,
      }
    : undefined;

  // Approve: extract full text, then analyse with Haiku
  const fallbackText = [article.title, article.excerpt].filter(Boolean).join('\n\n').trim();

  if (!fallbackText) {
    return NextResponse.json(
      { error: 'Article has no content to analyse' },
      { status: 400 }
    );
  }

  try {
    // Attempt full article text extraction
    let analyseText = fallbackText;
    let extractionMeta = { has_full_text: false, author: null as string | null, image_url: null as string | null, word_count: 0 };

    if (article.url) {
      await waitForDomain(article.url);
      const extracted = await extractArticleText(article.url, article.excerpt);
      if (extracted.has_full_text && extracted.text) {
        analyseText = extracted.text;
      }
      extractionMeta = {
        has_full_text: extracted.has_full_text,
        author: extracted.author,
        image_url: extracted.image_url,
        word_count: extracted.word_count,
      };
    }

    const analysis = await analyseContent(analyseText, projectContext);
    const needsReview = analysis.confidence_score < NEEDS_REVIEW_THRESHOLD;

    const { data: analysisItem, error: insertErr } = await supabaseAdmin
      .from('analysis_items')
      .insert({
        project_id: projectId,
        source_text: analyseText,
        source_type: 'news_article',
        source_url: article.url,
        summary: analysis.summary,
        sentiment: analysis.sentiment,
        alert_level: analysis.alert_level,
        notable_voices: analysis.notable_voices,
        key_themes: analysis.key_themes,
        recommended_action: analysis.recommended_action,
        review_status: 'approved',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        match_type: article.matched_by?.startsWith('Matched:') || article.matched_by?.startsWith('Partial match:')
          ? 'project_specific'
          : 'area_intelligence',
        match_reason: article.matched_by,
        confidence_score: analysis.confidence_score,
        needs_review: needsReview,
        key_entities: analysis.key_entities as unknown as Record<string, string[]>,
        is_new_information: analysis.is_new_information,
        new_information_detail: analysis.new_information_detail,
        match_confidence: isConfirmedMatch(article.matched_by) ? 'definite' : analysis.match_confidence,
        planning_stage: analysis.planning_stage_mentioned,
        themes: analysis.themes,
        has_full_text: extractionMeta.has_full_text,
        author: extractionMeta.author,
        image_url: extractionMeta.image_url,
        word_count: extractionMeta.word_count,
        created_by: userId,
      })
      .select('*')
      .single();

    if (insertErr || !analysisItem) {
      return NextResponse.json({ error: insertErr?.message ?? 'Insert failed' }, { status: 500 });
    }

    const itemId = (analysisItem as { id: string }).id;

    // Update fetched_article status
    await supabaseAdmin
      .from('fetched_articles')
      .update({ status: 'analysed', analysis_item_id: itemId })
      .eq('id', articleId);

    return NextResponse.json({
      message: 'Article analysed and approved',
      analysis_item: analysisItem,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    console.error(`[analyse] Article ${articleId} failed:`, message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
