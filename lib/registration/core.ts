// Core logic — Self-registration + Approval (docs/26 §5)
// แยกจาก UI/actions เพื่อ integration test ตรงได้ (pattern เดียวกับ lib/entry/claim.ts)

import {
  AuditAction,
  RegistrationRequestStatus,
  UserRoleEnum,
} from "@prisma/client";
import { auth } from "../auth";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { REQUESTABLE_ROLES, type RegistrationInput } from "./validation";

export type SubmitRegistrationResult =
  | { ok: true }
  | { ok: false; reason: "EMAIL_TAKEN" | "INVALID_COMMUNITY" | "ERROR" };

/**
 * ยื่นคำขอลงทะเบียน (public — ไม่มี session)
 * สร้าง User แบบ isActive=false (บังคับโดย user.create.before hook ใน lib/auth.ts)
 * พร้อม RegistrationRequest สถานะ PENDING — login ไม่ได้จนกว่า ADMIN อนุมัติ
 */
export async function submitRegistration(
  input: RegistrationInput,
): Promise<SubmitRegistrationResult> {
  // ตรวจชุมชนก่อนสร้างบัญชี — กัน orphan user เมื่อ input ไม่ถูกต้อง
  if (input.communityId) {
    const community = await prisma.community.findFirst({
      where: { id: input.communityId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!community) return { ok: false, reason: "INVALID_COMMUNITY" };
  }

  // กันอีเมลซ้ำแบบทราบผลชัด (Better Auth ก็ปฏิเสธซ้ำชั้นใน — ตรงนี้เพื่อ error ที่แม่นกว่า)
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) return { ok: false, reason: "EMAIL_TAKEN" };

  // ให้ Better Auth hash password เอง — ระบบไม่เคยเก็บ/เห็น plaintext
  // เก็บชื่อเต็มใน User.name (ชื่อ + สกุล) — บัญชีเจ้าหน้าที่ไม่ใช้คำนำหน้า
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  let userId: string;
  try {
    const result = await auth.api.signUpEmail({
      body: { email: input.email, password: input.password, name: fullName },
    });
    userId = result.user.id;
  } catch {
    // ชนกันกับการสมัครพร้อมกัน (unique email) หรือ auth ล้มเหลว — ไม่สะท้อนรายละเอียดภายใน
    return { ok: false, reason: "EMAIL_TAKEN" };
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (input.phone) {
        await tx.user.update({ where: { id: userId }, data: { phone: input.phone } });
      }
      await tx.registrationRequest.create({
        data: {
          userId,
          requestedRole: input.requestedRole,
          organization: input.organization ?? null,
          communityId: input.communityId ?? null,
          note: input.note ?? null,
        },
      });
    });
  } catch {
    // request row สร้างไม่สำเร็จ → ลบบัญชี inactive ที่เพิ่งสร้างทิ้ง (best-effort)
    // กัน orphan user ที่ login ไม่ได้และไม่มีคำขอให้แอดมินเห็น
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    return { ok: false, reason: "ERROR" };
  }

  await writeAuditLog({
    userId,
    action: AuditAction.CREATE,
    entityType: "RegistrationRequest",
    entityId: userId,
  });
  return { ok: true };
}

export interface RegistrationRequestRow {
  id: string;
  status: RegistrationRequestStatus;
  requestedRole: UserRoleEnum;
  organization: string | null;
  note: string | null;
  rejectReason: string | null;
  createdAt: Date;
  decidedAt: Date | null;
  user: { name: string; email: string; phone: string | null };
  community: { id: string; nameTh: string } | null;
  decidedBy: { name: string } | null;
}

const REQUEST_SELECT = {
  id: true,
  status: true,
  requestedRole: true,
  organization: true,
  note: true,
  rejectReason: true,
  createdAt: true,
  decidedAt: true,
  user: { select: { name: true, email: true, phone: true } },
  community: { select: { id: true, nameTh: true } },
  decidedBy: { select: { name: true } },
} as const;

/**
 * รายการคำขอสำหรับหน้าแอดมิน — PENDING ทั้งหมด (เก่าสุดก่อน) + ตัดสินล่าสุด 20 รายการ
 * PII (ชื่อ/อีเมล/เบอร์) เห็นได้เฉพาะผู้มี REGISTRATION_MANAGE เท่านั้น
 */
export async function listRegistrationRequests(ctx: AuthorizationContext): Promise<{
  pending: RegistrationRequestRow[];
  decided: RegistrationRequestRow[];
} | null> {
  if (!hasPermission(ctx, PERMISSIONS.REGISTRATION_MANAGE)) return null;

  const [pending, decided] = await Promise.all([
    prisma.registrationRequest.findMany({
      where: { status: RegistrationRequestStatus.PENDING },
      orderBy: { createdAt: "asc" },
      select: REQUEST_SELECT,
    }),
    prisma.registrationRequest.findMany({
      where: { status: { not: RegistrationRequestStatus.PENDING } },
      orderBy: { decidedAt: "desc" },
      take: 20,
      select: REQUEST_SELECT,
    }),
  ]);
  return { pending, decided };
}

export type DecideRegistrationResult =
  | { ok: true }
  | { ok: false; reason: "FORBIDDEN" | "NOT_FOUND_OR_DECIDED" | "INVALID_ROLE" };

/**
 * อนุมัติคำขอ — atomic + race-safe: เปลี่ยนสถานะด้วยเงื่อนไข PENDING (updateMany)
 * สองแอดมินกดพร้อมกัน → สำเร็จคนเดียว อีกคนได้ NOT_FOUND_OR_DECIDED
 * ใน transaction เดียว: activate user + มอบ role + มอบ community scope
 */
export async function approveRegistration(
  ctx: AuthorizationContext,
  requestId: string,
): Promise<DecideRegistrationResult> {
  if (!hasPermission(ctx, PERMISSIONS.REGISTRATION_MANAGE)) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  const request = await prisma.registrationRequest.findUnique({
    where: { id: requestId },
    select: { id: true, userId: true, requestedRole: true, communityId: true, status: true },
  });
  if (!request || request.status !== RegistrationRequestStatus.PENDING) {
    return { ok: false, reason: "NOT_FOUND_OR_DECIDED" };
  }
  // Defense-in-depth: ต่อให้ row ถูกเขียนด้วยช่องทางอื่น ก็ห้ามอนุมัติ role นอก whitelist
  if (!(REQUESTABLE_ROLES as readonly UserRoleEnum[]).includes(request.requestedRole)) {
    return { ok: false, reason: "INVALID_ROLE" };
  }

  const decidedAt = new Date();
  const approved = await prisma.$transaction(async (tx) => {
    const updated = await tx.registrationRequest.updateMany({
      where: { id: requestId, status: RegistrationRequestStatus.PENDING },
      data: {
        status: RegistrationRequestStatus.APPROVED,
        decidedById: ctx.userId,
        decidedAt,
      },
    });
    if (updated.count !== 1) return false; // แพ้ race — อีกคนตัดสินไปแล้ว

    await tx.user.update({
      where: { id: request.userId },
      data: { isActive: true },
    });
    await tx.userRole.upsert({
      where: { userId_role: { userId: request.userId, role: request.requestedRole } },
      create: {
        userId: request.userId,
        role: request.requestedRole,
        assignedBy: ctx.userId,
      },
      update: { isActive: true, assignedBy: ctx.userId },
    });
    if (request.communityId) {
      await tx.userCommunityScope.upsert({
        where: {
          userId_communityId: {
            userId: request.userId,
            communityId: request.communityId,
          },
        },
        create: { userId: request.userId, communityId: request.communityId },
        update: {},
      });
    }
    return true;
  });

  if (!approved) return { ok: false, reason: "NOT_FOUND_OR_DECIDED" };

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.APPROVE,
    entityType: "RegistrationRequest",
    entityId: requestId,
    changes: { status: { old: "PENDING", new: "APPROVED" } },
  });
  return { ok: true };
}

/** ปฏิเสธคำขอ — บัญชียังคง inactive, บันทึกเหตุผล + Audit REJECT */
export async function rejectRegistration(
  ctx: AuthorizationContext,
  requestId: string,
  reason: string,
): Promise<DecideRegistrationResult> {
  if (!hasPermission(ctx, PERMISSIONS.REGISTRATION_MANAGE)) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  const updated = await prisma.registrationRequest.updateMany({
    where: { id: requestId, status: RegistrationRequestStatus.PENDING },
    data: {
      status: RegistrationRequestStatus.REJECTED,
      decidedById: ctx.userId,
      decidedAt: new Date(),
      rejectReason: reason,
    },
  });
  if (updated.count !== 1) return { ok: false, reason: "NOT_FOUND_OR_DECIDED" };

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.REJECT,
    entityType: "RegistrationRequest",
    entityId: requestId,
    changes: { status: { old: "PENDING", new: "REJECTED" } },
    reason,
  });
  return { ok: true };
}
