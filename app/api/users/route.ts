import { NextResponse } from 'next/server';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';

async function syncClerkUsersToSupabase() {
  try {
    const clerkUsers = await clerkClient.users.getUserList({ limit: 100 });

    const rows = clerkUsers.data.map((u) => ({
      id: u.id,
      email: u.emailAddresses?.[0]?.emailAddress ?? '',
      first_name: u.firstName ?? null,
      last_name: u.lastName ?? null,
      role: (u.publicMetadata?.role as string) ?? 'team_member',
    }));

    if (rows.length > 0) {
      await supabaseAdmin.from('users').upsert(rows, { onConflict: 'id' });
    }

    return rows;
  } catch (e) {
    console.error('Failed to sync Clerk users:', e);
    return null;
  }
}

export async function GET() {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, first_name, last_name, role')
    .order('first_name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If the users table is empty, sync from Clerk and return those
  if (!data || data.length === 0) {
    const synced = await syncClerkUsersToSupabase();
    if (synced) {
      return NextResponse.json(synced);
    }
  }

  return NextResponse.json(data);
}
