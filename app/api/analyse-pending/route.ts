import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { analyseContent } from '@/lib/anthropic';
import { requireRole } from '@/lib/auth';

export const maxDuration = 120;

const BATCH_SIZE = 8;
const MAX_ATTEMPTS = 3;

async function countPending(): Promise<number> {
  const { count } = await supabaseAdmin
    .from('analysis_items')
    .select('id', { count: 'exact', head: true })
    .eq('analysis_status', 'pending');
  return count ?? 0;
}

export async function POST(_req: NextRequest) {
  try {
    await requireRole(['admin', 'project_lead']);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Pick candidate rows. Oldest first so we drain the backlog FIFO.
  const { data: pendingIds, error: selectError } = await supabaseAdmin
    .from('analysis_items')
    .select('id')
    .eq('analysis_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (!pendingIds || pendingIds.length === 0) {
    return NextResponse.json({
      processed: 0,
      completed: 0,
      failed: 0,
      still_pending: await countPending(),
    });
  }

  const ids = pendingIds.map((r) => r.id);

  // Atomic claim: flip to 'analysing' only where status is still 'pending'.
  // If another invocation grabbed one of these rows between our SELECT and
  // UPDATE, the AND analysis_status='pending' guard excludes it from
  // RETURNING and we simply process fewer rows this call.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('analysis_items')
    .update({ analysis_status: 'analysing' })
    .in('id', ids)
    .eq('analysis_status', 'pending')
    .select('id, full_text, source_text, analysis_attempts');

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  if (!claimed || claimed.length === 0) {
    return NextResponse.json({
      processed: 0,
      completed: 0,
      failed: 0,
      still_pending: await countPending(),
    });
  }

  let completed = 0;
  let failed = 0;

  // Sequential on purpose: Anthropic calls are expensive and rate-limited,
  // and we'd rather be predictable inside the 120s budget than opportunistic.
  for (const row of claimed) {
    const text = row.full_text ?? row.source_text;
    const attempts = row.analysis_attempts ?? 0;

    if (!text || !text.trim()) {
      // Nothing to analyse. Mark failed so it doesn't loop.
      await supabaseAdmin
        .from('analysis_items')
        .update({
          analysis_status: 'failed',
          analysis_attempts: attempts + 1,
          analysis_last_error: 'No source text to analyse',
        })
        .eq('id', row.id);
      failed++;
      continue;
    }

    try {
      const analysis = await analyseContent(text);

      const { error: updateError } = await supabaseAdmin
        .from('analysis_items')
        .update({
          summary: analysis.summary,
          sentiment: analysis.sentiment,
          alert_level: analysis.alert_level,
          notable_voices: analysis.notable_voices,
          key_themes: analysis.key_themes,
          recommended_action: analysis.recommended_action,
          analysis_status: 'complete',
          analysis_completed_at: new Date().toISOString(),
          analysis_last_error: null,
        })
        .eq('id', row.id);

      if (updateError) {
        // Analysis succeeded but the DB write didn't. Roll the row back
        // to 'pending' so a later run can retry — the analysis call was
        // the expensive bit, but we can't recover the result safely.
        await supabaseAdmin
          .from('analysis_items')
          .update({
            analysis_status: attempts + 1 >= MAX_ATTEMPTS ? 'failed' : 'pending',
            analysis_attempts: attempts + 1,
            analysis_last_error: `Post-analysis update failed: ${updateError.message}`,
          })
          .eq('id', row.id);
        failed++;
        continue;
      }

      completed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Analysis failed';
      const newAttempts = attempts + 1;
      const nextStatus = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending';

      await supabaseAdmin
        .from('analysis_items')
        .update({
          analysis_status: nextStatus,
          analysis_attempts: newAttempts,
          analysis_last_error: msg,
        })
        .eq('id', row.id);

      // Only count terminal failures here; rows kicked back to 'pending'
      // show up in still_pending for the next invocation.
      if (nextStatus === 'failed') failed++;
    }
  }

  return NextResponse.json({
    processed: claimed.length,
    completed,
    failed,
    still_pending: await countPending(),
  });
}
