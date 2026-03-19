import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyseContent, NEEDS_REVIEW_THRESHOLD } from '@/lib/anthropic';
import { ensureUserInSupabase } from '@/lib/auth';

export const maxDuration = 30;

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

  // Approve: analyse with Haiku then create analysis_item
  const text = [article.title, article.excerpt].filter(Boolean).join('\n\n').trim();

  if (!text) {
    return NextResponse.json(
      { error: 'Article has no content to analyse' },
      { status: 400 }
    );
  }

  try {
    const analysis = await analyseContent(text);
    const needsReview = analysis.confidence_score < NEEDS_REVIEW_THRESHOLD;

    const { data: analysisItem, error: insertErr } = await supabaseAdmin
      .from('analysis_items')
      .insert({
        project_id: projectId,
        source_text: text,
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
