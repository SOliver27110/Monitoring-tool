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
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
