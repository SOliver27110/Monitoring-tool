import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureUserInSupabase } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const projectId = searchParams.get('project_id');
  const reviewStatus = searchParams.get('review_status');

  let query = supabaseAdmin
    .from('analysis_items')
    .select('*, project:projects(id, client_name, site_name)')
    .order('created_at', { ascending: false });

  if (projectId) {
    query = query.eq('project_id', projectId);
  }

  if (reviewStatus) {
    query = query.eq('review_status', reviewStatus);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const userId = await ensureUserInSupabase();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('analysis_items')
    .insert({
      project_id: (body.project_id as string) || null,
      source_text: body.source_text as string,
      source_type: (body.source_type as string) || null,
      source_url: (body.source_url as string) || null,
      summary: body.summary as string,
      sentiment: body.sentiment as string,
      alert_level: body.alert_level as string,
      notable_voices: (body.notable_voices as string[]) ?? [],
      key_themes: (body.key_themes as string[]) ?? [],
      recommended_action: body.recommended_action as string,
      review_status: 'unreviewed',
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
