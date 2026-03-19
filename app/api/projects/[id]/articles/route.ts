import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * GET /api/projects/[id]/articles
 * List fetched_articles for a project, optionally filtered by status.
 * Query params: status (comma-separated), limit, offset
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = params.id;
  const searchParams = req.nextUrl.searchParams;
  const statusFilter = searchParams.get('status'); // e.g. "matched,pending"
  const limit = Math.min(Number(searchParams.get('limit')) || 200, 500);

  let query = supabaseAdmin
    .from('fetched_articles')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (statusFilter) {
    const statuses = statusFilter.split(',').map((s) => s.trim());
    query = query.in('status', statuses);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
