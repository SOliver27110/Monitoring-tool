import { auth, currentUser } from '@clerk/nextjs/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types';

interface SessionClaims {
  metadata?: {
    role?: string;
  };
}

export function getUserRole(): UserRole {
  const { sessionClaims } = auth();
  const claims = sessionClaims as SessionClaims | null;
  const role = claims?.metadata?.role;

  if (role === 'admin' || role === 'project_lead' || role === 'team_member') {
    return role;
  }

  return 'team_member';
}

export function requireRole(allowedRoles: UserRole[]): UserRole {
  const role = getUserRole();

  if (!allowedRoles.includes(role)) {
    throw new Error(`Forbidden: role '${role}' not in [${allowedRoles.join(', ')}]`);
  }

  return role;
}

export function canEdit(): boolean {
  return true;
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
