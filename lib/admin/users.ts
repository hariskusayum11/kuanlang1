// Admin — จัดการบทบาทผู้ใช้ (core, ไม่มี "use server")
// ---------------------------------------------------------------------------
// RBAC: ต้องมี user.manage (ADMIN) เท่านั้น — ตรวจฝั่ง server ทุกครั้ง
// ทุกการเปลี่ยนบทบาทต้องมี Audit Log เก็บค่าก่อน/หลัง (CLAUDE.md)

import { AuditAction, UserRoleEnum } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  roles: UserRoleEnum[];
  communityNames: string[];
  lastLoginAt: Date | null;
}

function canManage(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.USER_MANAGE);
}

/** รายชื่อผู้ใช้ทั้งหมดพร้อมบทบาทที่ใช้งานอยู่ */
export async function listUsers(ctx: AuthorizationContext): Promise<AdminUserRow[]> {
  if (!canManage(ctx)) return [];
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      lastLoginAt: true,
      userRoles: { where: { isActive: true }, select: { role: true } },
      communityScopes: {
        select: { community: { select: { nameTh: true } } },
      },
    },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
    roles: u.userRoles.map((r) => r.role),
    communityNames: u.communityScopes.map((s) => s.community.nameTh),
  }));
}

export type SetRolesResult =
  | { ok: true; roles: UserRoleEnum[] }
  | {
      ok: false;
      reason:
        | "NOT_ALLOWED"
        | "USER_NOT_FOUND"
        | "INVALID_ROLE"
        | "SELF_ADMIN_REMOVAL"
        | "LAST_ADMIN"
        | "ERROR";
    };

/**
 * ตั้งบทบาทของผู้ใช้ให้เป็นชุดที่ระบุ (แทนที่ของเดิมทั้งหมด)
 *
 * กันล็อกเอาต์ตัวเองและกันระบบไม่เหลือแอดมิน:
 *  - ห้ามถอด ADMIN ของตัวเอง (กันเผลอตัดสิทธิ์ตัวเองจนเข้าหน้าแอดมินไม่ได้อีก)
 *  - ห้ามถอด ADMIN คนสุดท้ายของระบบ
 */
export async function setUserRoles(
  ctx: AuthorizationContext,
  userId: string,
  roles: UserRoleEnum[],
): Promise<SetRolesResult> {
  if (!canManage(ctx)) return { ok: false, reason: "NOT_ALLOWED" };

  const valid = Object.values(UserRoleEnum);
  if (roles.some((r) => !valid.includes(r))) {
    return { ok: false, reason: "INVALID_ROLE" };
  }
  const next = [...new Set(roles)];

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      userRoles: { where: { isActive: true }, select: { role: true } },
    },
  });
  if (!target) return { ok: false, reason: "USER_NOT_FOUND" };

  const before = target.userRoles.map((r) => r.role);
  const hadAdmin = before.includes(UserRoleEnum.ADMIN);
  const keepsAdmin = next.includes(UserRoleEnum.ADMIN);

  if (hadAdmin && !keepsAdmin) {
    if (userId === ctx.userId) return { ok: false, reason: "SELF_ADMIN_REMOVAL" };
    const otherAdmins = await prisma.userRole.count({
      where: {
        role: UserRoleEnum.ADMIN,
        isActive: true,
        userId: { not: userId },
        user: { isActive: true },
      },
    });
    if (otherAdmins === 0) return { ok: false, reason: "LAST_ADMIN" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // ปิดบทบาทที่ไม่ได้อยู่ในชุดใหม่ (ไม่ลบทิ้ง — คงประวัติการมอบหมายไว้)
      await tx.userRole.updateMany({
        where: { userId, isActive: true, role: { notIn: next } },
        data: { isActive: false },
      });
      for (const role of next) {
        await tx.userRole.upsert({
          where: { userId_role: { userId, role } },
          create: { userId, role, assignedBy: ctx.userId },
          update: { isActive: true, assignedBy: ctx.userId },
        });
      }
    });
  } catch {
    return { ok: false, reason: "ERROR" };
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "UserRole",
    entityId: userId,
    // เก็บค่าก่อน/หลัง — บทบาทไม่ใช่ PII จึงบันทึกตรงได้
    changes: { before: before.sort(), after: [...next].sort() },
  });

  return { ok: true, roles: next };
}
