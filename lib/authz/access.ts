import type { UserRoleEnum } from "@prisma/client";
import type { Permission } from "./permissions";
import { ROLE_PERMISSIONS } from "./role-permissions";
import type { AuthorizationContext } from "./types";

/**
 * สร้างสิทธิ์จาก Role
 *
 * **Community Scope ถูกยกเลิกทั้งระบบ (Owner Decision 2026-08-03, #R7-B)**
 * ทุกบัญชีเห็นข้อมูลทุกชุมชน — `isGlobalScope` จึงเป็น `true` เสมอ
 * แทนที่คำตัดสินเดิม #R6-A ที่ให้ Global Scope เป็นธงรายบัญชี
 *
 * สิ่งที่ยังจำกัดการเข้าถึงต่อไป (ไม่ได้ถูกยกเลิก):
 *  - **Permission** ยังบังคับเต็มที่ — ไม่มี `verification.view` ก็ยังเข้าคิวตรวจไม่ได้
 *  - **ผู้คีย์เห็นเฉพาะใบที่ตนคีย์เอง** — บังคับด้วย `enteredById` ไม่ใช่ scope ชุมชน
 *  - **Audit Log** บันทึกทุกการเข้าดู/แก้ไขข้อมูลอ่อนไหวตามเดิม (มาตรการชดเชย)
 *
 * ตาราง `UserCommunityScope` และธง `User.hasGlobalCommunityScope` ยังคงอยู่ในฐานข้อมูล
 * แต่ไม่มีผลต่อการตัดสินสิทธิ์แล้ว — คงไว้เพื่อให้เปิดกลับได้โดยไม่ต้อง migrate ข้อมูล
 */
export function buildAuthorization(
  roles: UserRoleEnum[],
  _account: { hasGlobalCommunityScope?: boolean } = {},
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
  return {
    permissions: [...permissionSet],
    isGlobalScope: true,
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
