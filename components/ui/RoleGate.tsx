'use client';

import { useUser } from '@clerk/nextjs';
import type { UserRole } from '@/lib/types';

interface RoleGateProps {
  allowedRoles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

function getRoleFromUser(user: ReturnType<typeof useUser>['user']): UserRole {
  if (!user) return 'team_member';
  const meta = user.publicMetadata as Record<string, unknown> | undefined;
  const role = meta?.role;
  if (role === 'admin' || role === 'project_lead' || role === 'team_member') {
    return role;
  }
  return 'team_member';
}

export function RoleGate({ allowedRoles, children, fallback = null }: RoleGateProps) {
  const { user } = useUser();
  const role = getRoleFromUser(user);

  if (!allowedRoles.includes(role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

export function useUserRole(): UserRole {
  const { user } = useUser();
  return getRoleFromUser(user);
}
