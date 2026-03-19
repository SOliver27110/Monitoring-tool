// Trigger RSS ingestion for a single project — call once per project from the UI
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ingestFeedsForProject } from '@/lib/rssIngestion';

// Hobby plan cap — use per-project calls from the UI, not { all: true }
export const maxDuration = 60;

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

  if (!projectId) {
    return NextResponse.json(
      { error: 'project_id is required' },
      { status: 400 }
    );
  }

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
