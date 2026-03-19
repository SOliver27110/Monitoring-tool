import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * DELETE /api/projects/[id]/clear
 * Removes all fetched_articles and analysis_items for a project so it can be re-scanned fresh.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const projectId = params.id;

  try {
    // Delete fetched_articles first (references analysis_items via FK)
    const { count: articlesDeleted } = await supabaseAdmin
      .from('fetched_articles')
      .delete({ count: 'exact' })
      .eq('project_id', projectId);

    // Delete analysis_items
    const { count: itemsDeleted } = await supabaseAdmin
      .from('analysis_items')
      .delete({ count: 'exact' })
      .eq('project_id', projectId);

    return NextResponse.json({
      message: `Cleared ${articlesDeleted ?? 0} articles and ${itemsDeleted ?? 0} analysis items`,
      articles_deleted: articlesDeleted ?? 0,
      items_deleted: itemsDeleted ?? 0,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to clear data';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
