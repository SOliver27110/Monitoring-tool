import { auth, currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types';

export async function getUserRole(): Promise<UserRole> {
  const { userId } = auth();
  if (!userId) return 'team_member';

  const { data } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  const role = data?.role;
  if (role === 'admin' || role === 'project_lead' || role === 'team_member') {
    return role;
  }

  return 'team_member';
}

export async function requireRole(allowedRoles: UserRole[]): Promise<UserRole> {
  const role = await getUserRole();

  if (!allowedRoles.includes(role)) {
    throw new Error(`Forbidden: role '${role}' not in [${allowedRoles.join(', ')}]`);
  }

  return role;
}

export async function canEdit(): Promise<boolean> {
  const role = await getUserRole();
  return role === 'admin' || role === 'project_lead';
}

export async function ensureUserInSupabase(): Promise<string> {
  const { userId } = auth();
  if (!userId) {
    throw new Error('Not authenticated');
  }

  const { data: existingUser } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('id', userId)
    .single();

  if (!existingUser) {
    const user = await currentUser();
    const email = user?.emailAddresses?.[0]?.emailAddress ?? 'unknown@example.com';

    await supabaseAdmin.from('users').upsert({
      id: userId,
      email,
      first_name: user?.firstName ?? null,
      last_name: user?.lastName ?? null,
      role: 'team_member',
    });
  }

  return userId;
}
