import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['admin', 'project_lead']);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('analysis_items')
    .update({
      analysis_status: 'pending',
      analysis_attempts: 0,
      analysis_last_error: null,
    })
    .eq('id', params.id)
    .select('id')
    .single();

  if (error) {
    // PGRST116 = no rows returned by .single()
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, item_id: data.id });
}
