import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureUserInSupabase } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const userId = await ensureUserInSupabase();

  const body = await req.json();
  const action = body.action as string;

  if (action !== 'approve' && action !== 'dismiss') {
    return NextResponse.json(
      { error: 'Action must be "approve" or "dismiss"' },
      { status: 400 }
    );
  }

  const reviewStatus = action === 'approve' ? 'approved' : 'dismissed';

  const { data, error } = await supabaseAdmin
    .from('analysis_items')
    .update({
      review_status: reviewStatus,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.id)
    .eq('review_status', 'unreviewed')
    .select()
    .single();

  if (error) {
    // PGRST116 = no rows returned, meaning the item isn't in 'unreviewed' state
    const status = error.code === 'PGRST116' ? 409 : 500;
    const message = error.code === 'PGRST116'
      ? 'Item is not in a reviewable state'
      : error.message;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json(data);
}
