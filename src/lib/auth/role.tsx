"use client";

import type { ReactNode } from "react";
import { useUserProfile } from "@/lib/hooks/queries/users";

export type OrgRole = "member" | "admin" | "owner";

const ROLE_HIERARCHY: Record<OrgRole, number> = {
  member: 0,
  admin: 1,
  owner: 2,
};

/**
 * Returns true if the current user's role meets the minimum required role.
 * Use this hook instead of scattering role string comparisons through components.
 *
 * @example
 * const canManage = useHasRole('admin');
 * if (!canManage) return <ReadOnlyView />;
 */
export function useHasRole(minRole: OrgRole): boolean {
  const { profile } = useUserProfile();
  const roleKey = (profile?.membership?.role_key ?? "member") as OrgRole;
  return (ROLE_HIERARCHY[roleKey] ?? 0) >= (ROLE_HIERARCHY[minRole] ?? 0);
}

interface RequireRoleProps {
  /** Minimum role needed to see children. */
  role: OrgRole;
  /** Rendered when the user lacks the required role. Defaults to null. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Gate UI sections by role. Change the required role for a whole section
 * by changing the `role` prop in one place, not throughout child components.
 *
 * @example
 * <RequireRole role="admin">
 *   <DeleteButton />
 *   <EditButton />
 * </RequireRole>
 *
 * <RequireRole role="admin" fallback={<ReadOnlyBadge />}>
 *   <AdminPanel />
 * </RequireRole>
 */
export function RequireRole({ role, fallback = null, children }: RequireRoleProps): ReactNode {
  const allowed = useHasRole(role);
  return allowed ? children : fallback;
}
