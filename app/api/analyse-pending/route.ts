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
    .select('id, source_text')
    .eq('project_id', projectId)
    .eq('review_status', 'pending_analysis')
    .order('created_at', { ascending: true })
    .limit(3);

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
