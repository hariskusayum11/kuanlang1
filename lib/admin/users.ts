// Admin — จัดการบทบาทผู้ใช้ (core, ไม่มี "use server")
// ---------------------------------------------------------------------------
// RBAC: ต้องมี user.manage (ADMIN) เท่านั้น — ตรวจฝั่ง server ทุกครั้ง
// ทุกการเปลี่ยนบทบาทต้องมี Audit Log เก็บค่าก่อน/หลัง (CLAUDE.md)

import { AuditAction, Prisma, UserRoleEnum } from "@prisma/client";
import {
  canToggleActivation,
  deriveAccountStatus,
  type AccountStatus,
} from "../../domain/admin/account-status";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import { isLegacyRole } from "../authz/role-labels";
import type { AuthorizationContext } from "../authz/types";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  /** สถานะที่แสดงต่อแอดมิน — แยก "รออนุมัติ" ออกจาก "ถูกปิดบัญชี" */
  accountStatus: AccountStatus;
  roles: UserRoleEnum[];
  communityNames: string[];
  /** true = เห็นทุกชุมชนโดยไม่ต้องผูก UserCommunityScope (ธงระดับบัญชี) */
  hasGlobalCommunityScope: boolean;
  lastLoginAt: Date | null;
}

function canManage(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.USER_MANAGE);
}

/**
 * Key คงที่ของ advisory lock ที่ป้องกัน invariant "ต้องมี ADMIN ที่ยังใช้งานอยู่ ≥ 1"
 *
 * ค่านี้ต้องเป็นค่าเดียวกันทุกจุดที่แตะจำนวน Active ADMIN — ถ้าใช้คนละ key
 * สองเส้นทาง (ถอด Role / ปิดบัญชี) จะไม่ serialize กัน แล้วช่องโหว่กลับมาเหมือนเดิม
 */
const ADMIN_INVARIANT_LOCK_KEY = 728_451_001;

/**
 * จองสิทธิ์แต่ผู้เดียวในการเปลี่ยนแปลงที่กระทบจำนวน Active ADMIN
 *
 * ทำไมต้องมี: การนับแล้วค่อยเขียนภายใต้ READ COMMITTED ป้องกัน **write skew** ไม่ได้
 * ทรานแซกชัน A (ปิด B) และ B (ปิด A) ต่างอ่านเห็นว่า "อีกฝ่ายยัง active" จึงผ่าน guard
 * ทั้งคู่ แล้วเขียนคนละแถวจนเหลือ Active ADMIN = 0 เงื่อนไข `where isActive: true`
 * ช่วยไม่ได้เพราะแต่ละฝ่ายเขียนคนละแถว ไม่มีแถวไหนถูกแย่งกัน
 *
 * advisory lock ระดับทรานแซกชันบังคับให้ "นับ → ตรวจ → เขียน" เกิดทีละหนึ่งราย
 * ผู้มาทีหลังจึงนับหลังจากผู้มาก่อน commit แล้ว และเห็นสภาพจริงว่าเหลือคนสุดท้าย
 * ปล่อยล็อกอัตโนมัติเมื่อ commit/rollback จึงไม่มีล็อกค้างแม้เกิด error
 *
 * เลือกแนวทางนี้แทน Serializable + retry เพราะไม่ต้องมี retry loop ให้พลาด
 * และงานจัดการบัญชีมีปริมาณน้อยมาก การ serialize จึงไม่กระทบประสิทธิภาพ
 */
async function lockAdminInvariant(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADMIN_INVARIANT_LOCK_KEY}::bigint)`;
}

/** จำนวนบัญชีที่ยังใช้งานอยู่และมีบทบาท ADMIN — อ่านภายใต้ล็อกเท่านั้น */
async function countOtherActiveAdmins(
  tx: Prisma.TransactionClient,
  exceptUserId: string,
): Promise<number> {
  return tx.userRole.count({
    where: {
      role: UserRoleEnum.ADMIN,
      isActive: true,
      userId: { not: exceptUserId },
      user: { isActive: true },
    },
  });
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
      hasGlobalCommunityScope: true,
      userRoles: { where: { isActive: true }, select: { role: true } },
      // 1 คำขอต่อบัญชี (RegistrationRequest.userId เป็น @unique)
      registrationRequest: { select: { status: true } },
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
    accountStatus: deriveAccountStatus(
      u.isActive,
      u.registrationRequest?.status ?? null,
    ),
    lastLoginAt: u.lastLoginAt,
    hasGlobalCommunityScope: u.hasGlobalCommunityScope,
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
        | "LEGACY_ROLE_NOT_ASSIGNABLE"
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
 *
 * บทบาทเดิมที่เลิกใช้แล้ว (COORDINATOR / VERIFIER — Owner Decision #R6-D):
 *  - **มอบหมายใหม่ไม่ได้** แม้เรียก Server Action ตรง (การซ่อน checkbox ไม่ใช่ Authorization)
 *  - แต่ของที่บัญชีมีอยู่แล้ว **ห้ามถูกถอดโดยผลข้างเคียง** ของการกดบันทึกบทบาทอื่น
 *    เพราะการถอด VERIFIER ทิ้งเฉย ๆ จะทำให้ผู้ใช้เสียสิทธิ์เห็นทุกชุมชนเงียบ ๆ
 *    การย้ายต้องทำผ่าน Data Migration ที่ตั้ง hasGlobalCommunityScope ให้ด้วย (Commit ถัดไป)
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

  // ห้ามมอบหมายบทบาทเดิมที่เลิกใช้แล้ว — ยกเว้นบทบาทที่บัญชีนี้ "มีอยู่ก่อนแล้ว"
  // (ปล่อยผ่านเพื่อให้การกดบันทึกโดยไม่ตั้งใจไม่ถอดของเดิมทิ้ง)
  const newLegacy = next.filter((r) => isLegacyRole(r) && !before.includes(r));
  if (newLegacy.length > 0) {
    return { ok: false, reason: "LEGACY_ROLE_NOT_ASSIGNABLE" };
  }
  // บทบาทเดิมที่ติดมากับบัญชี — คงไว้เสมอจนกว่า Data Migration จะย้ายให้
  const keptLegacy = before.filter((r) => isLegacyRole(r));
  const preserved = [...new Set([...next, ...keptLegacy])];

  const hadAdmin = before.includes(UserRoleEnum.ADMIN);
  const keepsAdmin = next.includes(UserRoleEnum.ADMIN);

  if (hadAdmin && !keepsAdmin && userId === ctx.userId) {
    return { ok: false, reason: "SELF_ADMIN_REMOVAL" };
  }

  // ถอด ADMIN ออกจากใครสักคน = ลดจำนวน Active ADMIN → ต้อง serialize กับการปิดบัญชี
  // ด้วยล็อกตัวเดียวกัน มิฉะนั้น A ถอด Role ของ B พร้อมกับ B ปิดบัญชีของ A
  // จะผ่าน guard ทั้งคู่แล้วระบบไม่เหลือแอดมิน
  const removesAdmin = hadAdmin && !keepsAdmin;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      if (removesAdmin) {
        await lockAdminInvariant(tx);
        if ((await countOtherActiveAdmins(tx, userId)) === 0) {
          return "LAST_ADMIN" as const;
        }
      }
      // ปิดบทบาทที่ไม่ได้อยู่ในชุดใหม่ (ไม่ลบทิ้ง — คงประวัติการมอบหมายไว้)
      await tx.userRole.updateMany({
        where: { userId, isActive: true, role: { notIn: preserved } },
        data: { isActive: false },
      });
      for (const role of preserved) {
        await tx.userRole.upsert({
          where: { userId_role: { userId, role } },
          create: { userId, role, assignedBy: ctx.userId },
          update: { isActive: true, assignedBy: ctx.userId },
        });
      }
      return "OK" as const;
    });
    if (outcome === "LAST_ADMIN") return { ok: false, reason: "LAST_ADMIN" };
  } catch {
    return { ok: false, reason: "ERROR" };
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "UserRole",
    entityId: userId,
    // เก็บค่าก่อน/หลัง — บทบาทไม่ใช่ PII จึงบันทึกตรงได้
    changes: { before: before.sort(), after: [...preserved].sort() },
  });

  return { ok: true, roles: preserved };
}

export type SetGlobalScopeResult =
  | { ok: true; hasGlobalCommunityScope: boolean }
  | {
      ok: false;
      reason: "NOT_ALLOWED" | "USER_NOT_FOUND" | "SELF_SCOPE_CHANGE" | "ERROR";
    };

/**
 * เปิด/ปิด Global Community Scope ระดับบัญชี (Owner Decision 2026-07-31 #R6-A)
 *
 * ข้อกำหนดด้านความปลอดภัย:
 *  - ตรวจสิทธิ์ฝั่ง server เสมอ (การซ่อนปุ่มไม่ใช่ Authorization)
 *  - ห้ามผู้ใช้แก้ Global Scope ของ "ตัวเอง" — กันการยกระดับสิทธิ์ตนเอง
 *    (แม้จะมี user.manage อยู่แล้วก็ตาม ต้องให้แอดมินอีกคนเป็นผู้ให้)
 *  - เขียน Audit Log ค่าก่อน/หลังทุกครั้ง
 */
export async function setUserGlobalScope(
  ctx: AuthorizationContext,
  userId: string,
  hasGlobalCommunityScope: boolean,
): Promise<SetGlobalScopeResult> {
  if (!canManage(ctx)) return { ok: false, reason: "NOT_ALLOWED" };
  if (userId === ctx.userId) return { ok: false, reason: "SELF_SCOPE_CHANGE" };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, hasGlobalCommunityScope: true },
  });
  if (!target) return { ok: false, reason: "USER_NOT_FOUND" };

  // ไม่มีอะไรเปลี่ยน → ไม่เขียน Audit Log ซ้ำโดยไม่จำเป็น
  if (target.hasGlobalCommunityScope === hasGlobalCommunityScope) {
    return { ok: true, hasGlobalCommunityScope };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { hasGlobalCommunityScope },
    });
  } catch {
    return { ok: false, reason: "ERROR" };
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "UserCommunityScope",
    entityId: userId,
    changes: {
      field: "hasGlobalCommunityScope",
      before: target.hasGlobalCommunityScope,
      after: hasGlobalCommunityScope,
    },
  });

  return { ok: true, hasGlobalCommunityScope };
}

export type SetActiveResult =
  | { ok: true; isActive: boolean; changed: boolean }
  | {
      ok: false;
      reason:
        | "NOT_ALLOWED"
        | "USER_NOT_FOUND"
        | "SELF_DEACTIVATION"
        | "LAST_ACTIVE_ADMIN"
        | "NOT_TOGGLEABLE"
        | "ERROR";
    };

/**
 * เปิด/ปิดบัญชีผู้ใช้ (Owner Decision 2026-07-31 #R6-C)
 *
 * ใช้คอลัมน์เดิม `User.isActive` — ไม่สร้างระบบสถานะซ้ำ
 * ผลมีทันทีในรอบ request ถัดไป เพราะ getActiveSessionUser() อ่าน isActive
 * จากฐานข้อมูลทุกครั้ง (lib/auth-session.ts) ไม่ได้เชื่อ session cookie
 *
 * ข้อกำหนดด้านความปลอดภัย:
 *  - ตรวจ user.manage ฝั่ง server เสมอ (การซ่อนปุ่มไม่ใช่ Authorization)
 *  - ห้ามปิดบัญชีตนเอง — กันล็อกตัวเองออกจากระบบโดยไม่ตั้งใจ
 *  - ต้องเหลือ ADMIN ที่ยัง active อย่างน้อย 1 บัญชีเสมอ
 *    ตรวจ**ภายใน transaction** ไม่ใช่เชื่อค่าที่ UI ส่งมา
 *  - ห้ามแตะ Role/Scope — เปิดบัญชีกลับต้องได้สิทธิ์เดิมคืนพอดี ไม่มากไม่น้อย
 *  - สั่งค่าเดิมซ้ำ = ไม่เปลี่ยนอะไร และไม่เขียน Audit Log ซ้ำ
 */
export async function setUserActive(
  ctx: AuthorizationContext,
  userId: string,
  isActive: boolean,
): Promise<SetActiveResult> {
  if (!canManage(ctx)) return { ok: false, reason: "NOT_ALLOWED" };
  if (userId === ctx.userId && !isActive) {
    return { ok: false, reason: "SELF_DEACTIVATION" };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      registrationRequest: { select: { status: true } },
    },
  });
  if (!target) return { ok: false, reason: "USER_NOT_FOUND" };

  if (target.isActive === isActive) {
    return { ok: true, isActive, changed: false };
  }

  // บัญชีที่ยังไม่ผ่านการอนุมัติต้องใช้เส้นทางอนุมัติ (ซึ่งมอบ Role/Scope ให้ด้วย)
  // ถ้าเปิดตรงนี้ ผู้ใช้จะ login ได้แต่ไม่มีสิทธิ์ใดเลย แล้วไปเจอ /access-denied
  const status = deriveAccountStatus(
    target.isActive,
    target.registrationRequest?.status ?? null,
  );
  if (!canToggleActivation(status)) return { ok: false, reason: "NOT_TOGGLEABLE" };

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (!isActive) {
        // ต้องจองล็อก **ก่อนอ่าน** — ถ้าอ่านก่อนล็อก ค่าที่นับได้จะเก่าไปแล้ว
        await lockAdminInvariant(tx);
        const isTargetAdmin = await tx.userRole.count({
          where: { userId, role: UserRoleEnum.ADMIN, isActive: true },
        });
        if (isTargetAdmin > 0 && (await countOtherActiveAdmins(tx, userId)) === 0) {
          return "LAST_ACTIVE_ADMIN" as const;
        }
      }
      // อัปเดตแบบมีเงื่อนไขค่าเดิม — กันเขียนทับเมื่อมีคนตั้งค่าเดียวกันไปแล้ว
      // (คนละเรื่องกับ invariant ข้ามแถวข้างบน ซึ่งเงื่อนไขนี้ป้องกันไม่ได้)
      const updated = await tx.user.updateMany({
        where: { id: userId, isActive: !isActive },
        data: { isActive },
      });
      if (updated.count !== 1) return "RACE" as const;
      return "OK" as const;
    });

    if (result === "LAST_ACTIVE_ADMIN") {
      return { ok: false, reason: "LAST_ACTIVE_ADMIN" };
    }
    // แพ้ race = มีคนตั้งค่าเดียวกันไปแล้ว ผลลัพธ์สุดท้ายตรงกับที่ขอ
    if (result === "RACE") return { ok: true, isActive, changed: false };
  } catch {
    return { ok: false, reason: "ERROR" };
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "User",
    entityId: userId,
    // รูปแบบเดียวกับการเปลี่ยน Role/Global Scope — ไม่มี PII, ไม่มี token/รหัสผ่าน
    changes: { field: "isActive", before: !isActive, after: isActive },
    reason: isActive ? "account-activated" : "account-deactivated",
  });

  return { ok: true, isActive, changed: true };
}
