import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ensureUserInSupabase, requireRole } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get('search') ?? '';
  const alertLevel = searchParams.get('alert_level') ?? '';
  const lpa = searchParams.get('lpa') ?? '';

  let query = supabaseAdmin
    .from('projects')
    .select('*, assigned_lead:users!projects_assigned_lead_id_fkey(id, first_name, last_name, email)')
    .order('updated_at', { ascending: false });

  if (search) {
    query = query.or(`client_name.ilike.%${search}%,site_name.ilike.%${search}%,planning_reference.ilike.%${search}%`);
  }

  if (alertLevel) {
    query = query.eq('alert_level', alertLevel);
  }

  if (lpa) {
    query = query.eq('lpa', lpa);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  try {
    await requireRole(['admin', 'project_lead']);
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const userId = await ensureUserInSupabase();
  const body = await req.json();

  const planningRef =
    typeof body.planning_reference === 'string' ? body.planning_reference.trim() : '';
  const clientTerms =
    typeof body.client_search_terms === 'string' ? body.client_search_terms.trim() : '';

  const { data, error } = await supabaseAdmin
    .from('projects')
    .insert({
      client_name: body.client_name,
      site_name: body.site_name,
      planning_reference: planningRef || null,
      lpa: body.lpa,
      boolean_search_terms: body.boolean_search_terms,
      client_search_terms: clientTerms || null,
      assigned_lead_id: body.assigned_lead_id || null,
      application_stage: body.application_stage,
      key_dates: body.key_dates ?? {},
      alert_level: body.alert_level ?? 'green',
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
