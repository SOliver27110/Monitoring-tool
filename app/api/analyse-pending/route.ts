import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyseContent } from '@/lib/anthropic';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const projectId = body.project_id as string | undefined;
  if (!projectId) {
    return NextResponse.json({ error: 'project_id is required' }, { status: 400 });
  }

  // Fetch up to 3 pending items. We use .order('created_at') so the oldest
  // items get analysed first, and .limit(3) to keep each call well under 60s.
  const { data: items, error: fetchError } = await supabaseAdmin
    .from('analysis_items')
    .select('id, source_text, review_status')
    .eq('project_id', projectId)
    .eq('review_status', 'pending_analysis')
    .order('created_at', { ascending: true })
    .limit(3);

  console.log(`[analyse-pending] project_id=${projectId} query returned ${items?.length ?? 0} rows, fetchError=${fetchError?.message ?? 'none'}`);
  if (items && items.length > 0) {
    console.log(`[analyse-pending] first row id=${items[0].id}, review_status=${items[0].review_status}`);
  }

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ analysed: 0, remaining: 0, errors: [] });
  }

  let analysed = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const analysis = await analyseContent(item.source_text);

      const { error: updateError } = await supabaseAdmin
        .from('analysis_items')
        .update({
          summary: analysis.summary,
          sentiment: analysis.sentiment,
          alert_level: analysis.alert_level,
          notable_voices: analysis.notable_voices,
          key_themes: analysis.key_themes,
          recommended_action: analysis.recommended_action,
          review_status: 'unreviewed',
        })
        .eq('id', item.id)
        .eq('review_status', 'pending_analysis'); // guard against concurrent updates

      if (updateError) {
        errors.push(`[${item.id}] ${updateError.message}`);
      } else {
        analysed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      errors.push(`[${item.id}] ${msg}`);

      // Mark as failed so it won't be retried endlessly
      await supabaseAdmin
        .from('analysis_items')
        .update({ review_status: 'analysis_failed' })
        .eq('id', item.id)
        .eq('review_status', 'pending_analysis');
    }
  }

  // Count how many pending items remain for this project
  const { count } = await supabaseAdmin
    .from('analysis_items')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('review_status', 'pending_analysis');

  return NextResponse.json({
    analysed,
    remaining: count ?? 0,
    errors,
  });
}
