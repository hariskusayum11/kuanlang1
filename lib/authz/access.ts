import type { UserRoleEnum } from "@prisma/client";
import type { Permission } from "./permissions";
import { GLOBAL_SCOPE_ROLES, ROLE_PERMISSIONS } from "./role-permissions";
import type { AuthorizationContext } from "./types";

export function buildAuthorization(roles: UserRoleEnum[]): {
  permissions: readonly Permission[];
  isGlobalScope: boolean;
} {
  const permissionSet = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      permissionSet.add(permission);
    }
  }
  return {
    permissions: [...permissionSet],
    isGlobalScope: roles.some((role) => GLOBAL_SCOPE_ROLES.includes(role)),
  };
}

export function hasPermission(
  ctx: Pick<AuthorizationContext, "permissions">,
  permission: Permission,
): boolean {
  return ctx.permissions.includes(permission);
}

export function hasAnyPermission(
  ctx: Pick<AuthorizationContext, "permissions">,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => hasPermission(ctx, permission));
}

export function canAccessCommunity(
  ctx: Pick<AuthorizationContext, "isGlobalScope" | "communityIds">,
  communityId: string,
): boolean {
  if (ctx.isGlobalScope) return true;
  return ctx.communityIds.includes(communityId);
}
