import { UserRoleEnum } from "@prisma/client";
import type { Permission } from "./permissions";
import { ROLE_PERMISSIONS } from "./role-permissions";
import type { AuthorizationContext } from "./types";

/**
 * Role ที่ไม่ได้ให้สิทธิ์ดูข้อมูลสำรวจระดับชุมชนเลย — ถือครองร่วมกับ COMMUNITY_LEADER
 * แล้วบัญชียังถูกจำกัดขอบเขตอยู่ (อาสาสมัคร/ผู้สำรวจไม่มีหน้าข้อมูล · ผู้คีย์ถูกกรองด้วย
 * `enteredById` ไม่ใช่ชุมชน) — Role อื่นทุกตัว (รวมถึง Role ใหม่ในอนาคต) ทำให้กลับเป็นทั้งระบบ
 */
const LEADER_COMPATIBLE_ROLES: ReadonlySet<UserRoleEnum> = new Set([
  UserRoleEnum.COMMUNITY_LEADER,
  UserRoleEnum.VOLUNTEER,
  UserRoleEnum.FIELD_SURVEYOR,
  UserRoleEnum.DATA_ENTRY,
]);

/**
 * บัญชีหัวหน้าชุมชนที่ต้องจำกัดเฉพาะชุมชนที่ผูกใน `UserCommunityScope` (docs/41)
 * — มี COMMUNITY_LEADER และไม่มี Role อื่นที่เห็นข้อมูลทั้งระบบอยู่แล้ว
 */
export function isCommunityScopedAccount(roles: readonly UserRoleEnum[]): boolean {
  return (
    roles.includes(UserRoleEnum.COMMUNITY_LEADER) &&
    roles.every((role) => LEADER_COMPATIBLE_ROLES.has(role))
  );
}

/**
 * สร้างสิทธิ์จาก Role
 *
 * **Community Scope ถูกยกเลิกทั้งระบบ (Owner Decision 2026-08-03, #R7-B)**
 * ทุกบัญชีเห็นข้อมูลทุกชุมชน — `isGlobalScope` เป็น `true`
 * แทนที่คำตัดสินเดิม #R6-A ที่ให้ Global Scope เป็นธงรายบัญชี
 *
 * **ข้อยกเว้นเดียว: หัวหน้าชุมชน (Owner Decision 2026-10-19, docs/41)** — บัญชีที่
 * `isCommunityScopedAccount()` ได้ `isGlobalScope: false` แล้ว `communityIds` มาจาก
 * `UserCommunityScope` · ไม่ผูกชุมชน = ไม่เห็นอะไรเลย (ห้าม fallback เป็นทั้งระบบ)
 *
 * สิ่งที่ยังจำกัดการเข้าถึงต่อไป (ไม่ได้ถูกยกเลิก):
 *  - **Permission** ยังบังคับเต็มที่ — ไม่มี `verification.view` ก็ยังเข้าคิวตรวจไม่ได้
 *  - **ผู้คีย์เห็นเฉพาะใบที่ตนคีย์เอง** — บังคับด้วย `enteredById` ไม่ใช่ scope ชุมชน
 *  - **Audit Log** บันทึกทุกการเข้าดู/แก้ไขข้อมูลอ่อนไหวตามเดิม (มาตรการชดเชย)
 *
 * ธง `User.hasGlobalCommunityScope` ไม่มีผลต่อการตัดสินสิทธิ์แล้ว (อาจค้างค่าเดิม)
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
    isGlobalScope: !isCommunityScopedAccount(roles),
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

/** ชุมชนที่ต้องกรองสำหรับ query — `undefined` = ทั้งระบบ · `[]` = ไม่เห็นอะไร (ห้าม fallback) */
export function scopedCommunityIds(
  ctx: Pick<AuthorizationContext, "isGlobalScope" | "communityIds">,
): string[] | undefined {
  return ctx.isGlobalScope ? undefined : ctx.communityIds;
}

export function canAccessCommunity(
  ctx: Pick<AuthorizationContext, "isGlobalScope" | "communityIds">,
  communityId: string,
): boolean {
  if (ctx.isGlobalScope) return true;
  return ctx.communityIds.includes(communityId);
}
