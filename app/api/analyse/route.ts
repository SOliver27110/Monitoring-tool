import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyseContent } from '@/lib/anthropic';
import { ensureUserInSupabase } from '@/lib/auth';

export const maxDuration = 30;

/**
 * POST /api/analyse
 * Picks up the next pending_analysis item, runs Claude analysis, and updates it.
 * Returns { done: true } when no more items remain.
 */
export async function POST() {
  await ensureUserInSupabase();

  // Pick the oldest pending_analysis item
  const { data: item, error: fetchErr } = await supabaseAdmin
    .from('analysis_items')
    .select('id, source_text')
    .eq('review_status', 'pending_analysis')
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (fetchErr || !item) {
    // No more pending items
    return NextResponse.json({ done: true, remaining: 0 });
  }

  // Count remaining (including this one)
  const { count } = await supabaseAdmin
    .from('analysis_items')
    .select('id', { count: 'exact', head: true })
    .eq('review_status', 'pending_analysis');

  try {
    const analysis = await analyseContent(item.source_text);

    const { error: updateErr } = await supabaseAdmin
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
      .eq('id', item.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      done: false,
      analysed_id: item.id,
      remaining: (count ?? 1) - 1,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    return NextResponse.json(
      { error: message, remaining: count ?? 0 },
      { status: 502 }
    );
  }
}
