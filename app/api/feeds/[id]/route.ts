import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureUserInSupabase } from '@/lib/auth';

// GET /api/feeds/:id
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureUserInSupabase();

  const { data, error } = await supabaseAdmin
    .from('feeds')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: 'Feed not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

// PATCH /api/feeds/:id — update a feed
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureUserInSupabase();

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) updates.name = body.name;
  if (body.feed_type !== undefined) updates.feed_type = body.feed_type;
  if (body.feed_url !== undefined) updates.feed_url = body.feed_url;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('feeds')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/feeds/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await ensureUserInSupabase();

  const { error } = await supabaseAdmin
    .from('feeds')
    .delete()
    .eq('id', params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Feed deleted' });
}
