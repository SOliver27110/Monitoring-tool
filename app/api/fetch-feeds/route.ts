import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ingestFeedsForProject } from '@/lib/rssIngestion';

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const projectId = body.project_id as string | undefined;
  const all = body.all as boolean | undefined;

  if (!projectId && !all) {
    return NextResponse.json(
      { error: 'Provide either project_id or { all: true }' },
      { status: 400 }
    );
  }

  // Single project
  if (projectId) {
    const { data: project, error } = await supabaseAdmin
      .from('projects')
      .select('id, lpa, boolean_search_terms, client_name, site_name, planning_reference')
      .eq('id', projectId)
      .single();

    if (error || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const result = await ingestFeedsForProject(project, userId);

    return NextResponse.json({
      project_id: project.id,
      ingested: result.ingested,
      skipped: result.skipped,
      errors: result.errors,
    });
  }

  // All projects
  const { data: projects, error: projErr } = await supabaseAdmin
    .from('projects')
    .select('id, lpa, boolean_search_terms, client_name, site_name, planning_reference');

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({
      projects_processed: 0,
      total_ingested: 0,
      total_skipped: 0,
      results: [],
    });
  }

  const results: Array<{
    project_id: string;
    client_name: string;
    ingested: number;
    skipped: number;
    errors: string[];
  }> = [];

  for (const project of projects) {
    const result = await ingestFeedsForProject(project, userId);
    results.push({
      project_id: project.id,
      client_name: project.client_name,
      ingested: result.ingested,
      skipped: result.skipped,
      errors: result.errors,
    });
  }

  const totalIngested = results.reduce((sum, r) => sum + r.ingested, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

  return NextResponse.json({
    projects_processed: results.length,
    total_ingested: totalIngested,
    total_skipped: totalSkipped,
    results,
  });
}
