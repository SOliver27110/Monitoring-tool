import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureUserInSupabase } from '@/lib/auth';

// GET /api/feeds?project_id=xxx — list feeds, optionally filtered by project
export async function GET(req: NextRequest) {
  await ensureUserInSupabase();

  const projectId = req.nextUrl.searchParams.get('project_id');

  let query = supabaseAdmin
    .from('feeds')
    .select('*')
    .order('created_at', { ascending: false });

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/feeds — create a new feed
export async function POST(req: NextRequest) {
  await ensureUserInSupabase();

  const body = await req.json();
  const { project_id, name, feed_type, url } = body;

  if (!project_id || !name || !url || !feed_type) {
    return NextResponse.json(
      { error: 'project_id, name, feed_type, and url are required' },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('feeds')
    .insert({
      project_id,
      name,
      feed_type,
      url,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
