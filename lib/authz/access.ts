import type { UserRoleEnum } from "@prisma/client";
import type { Permission } from "./permissions";
import { GLOBAL_SCOPE_ROLES, ROLE_PERMISSIONS } from "./role-permissions";
import type { AuthorizationContext } from "./types";

/**
 * สร้างสิทธิ์จาก Role + ธงระดับบัญชี
 *
 * Global Community Scope มาได้ 2 ทาง (Owner Decision 2026-07-31 #R6-A):
 *  1. Role-based — ADMIN/EXECUTIVE เท่านั้น (GLOBAL_SCOPE_ROLES) — ห้ามเพิ่ม Role ใด
 *     เข้ารายการนี้อีก โดยเฉพาะ Legacy Role ที่ยังค้างอยู่ใน enum
 *  2. Account-based — `User.hasGlobalCommunityScope` มอบให้เป็นราย "บัญชี"
 *     ใช้กับกรณีเช่น OFFICER บางคนต้องตรวจทุกชุมชน แต่ OFFICER คนอื่นต้องไม่เห็น
 *     → ห้ามแก้ด้วยการยก OFFICER ทั้ง Role ขึ้นเป็น global เด็ดขาด
 */
export function buildAuthorization(
  roles: UserRoleEnum[],
  account: { hasGlobalCommunityScope?: boolean } = {},
): {
  permissions: readonly Permission[];
  isGlobalScope: boolean;
} {
  const permissionSet = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) {
      permissionSet.add(permission);
    }
  }
  const roleGrantsGlobal = roles.some((role) => GLOBAL_SCOPE_ROLES.includes(role));
  return {
    permissions: [...permissionSet],
    isGlobalScope: roleGrantsGlobal || account.hasGlobalCommunityScope === true,
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
