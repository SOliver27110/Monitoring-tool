import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*, assigned_lead:users!projects_assigned_lead_id_fkey(id, first_name, last_name, email)')
    .eq('id', params.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole(['admin', 'project_lead']);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();

  const { data, error } = await supabaseAdmin
    .from('projects')
    .update({
      client_name: body.client_name,
      site_name: body.site_name,
      planning_reference: body.planning_reference,
      lpa: body.lpa,
      boolean_search_terms: body.boolean_search_terms,
      assigned_lead_id: body.assigned_lead_id || null,
      application_stage: body.application_stage,
      key_dates: body.key_dates ?? {},
      alert_level: body.alert_level ?? 'green',
    })
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
