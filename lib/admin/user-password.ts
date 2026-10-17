// ADMIN ตั้งรหัสผ่านชั่วคราวให้ผู้ใช้รายอื่น (Owner Decision 2026-10-17)
//
// จำเป็นเมื่อระบบอีเมลถูกปิด (EMAIL_ENABLED=false) เพราะไม่มีลิงก์ "ลืมรหัสผ่าน"
// ให้ผู้ใช้ทำเอง — ถ้าไม่มีทางนี้ ผู้ใช้ที่ลืมรหัสจะถูกล็อกออกจากระบบถาวร
// (รหัสผ่านถูก hash ไว้ แก้ใน DB ตรง ๆ ไม่ได้)
//
// มาตรการชดเชยที่ต้องคงไว้เสมอ:
//  - รหัสชั่วคราวแสดงให้ ADMIN เห็น "ครั้งเดียว" บนหน้าจอ ไม่เก็บลง DB และไม่เขียนลง log
//  - ตั้ง mustChangePassword=true → ผู้ใช้ถูกบังคับเปลี่ยนรหัสก่อนใช้งานหน้าอื่น
//  - ลบ session ทั้งหมดของผู้ใช้ → อุปกรณ์ที่ค้างอยู่ถูกตัดออกทันที
//  - Audit Log ทุกครั้ง โดยไม่บันทึกค่ารหัสผ่าน

import { randomBytes } from "node:crypto";
import { AuditAction } from "@prisma/client";
import { auth } from "../auth";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import {
  TEMP_PASSWORD_RANDOM_BYTES,
  buildTempPassword,
} from "../../domain/admin/temp-password";
import {
  isBlockedByProtectedAccount,
  type ProtectedAction,
} from "../../domain/admin/protected-account";

export type ResetUserPasswordResult =
  | { ok: true; tempPassword: string }
  | {
      ok: false;
      reason:
        | "NOT_ALLOWED"
        | "USER_NOT_FOUND"
        | "SELF_RESET"
        | "PROTECTED_ACCOUNT"
        | "ERROR";
    };

/**
 * ตั้งรหัสผ่านชั่วคราวให้ผู้ใช้ แล้วคืนค่ารหัสกลับไปแสดงบนหน้าจอครั้งเดียว
 *
 * ไม่รับรหัสผ่านจาก client — ระบบสุ่มให้เสมอ เพื่อไม่ให้ ADMIN ตั้งรหัสที่เดาง่าย
 * หรือใช้รหัสซ้ำกับระบบอื่นของผู้ใช้
 */
export async function resetUserPassword(
  ctx: AuthorizationContext,
  userId: string,
): Promise<ResetUserPasswordResult> {
  if (!hasPermission(ctx, PERMISSIONS.USER_PASSWORD_RESET)) {
    return { ok: false, reason: "NOT_ALLOWED" };
  }
  // ตั้งรหัสชั่วคราวให้ตัวเองไม่มีประโยชน์ และจะบังคับให้ตัวเองเปลี่ยนรหัสทันที
  // ผู้ที่รู้รหัสตัวเองให้ใช้หน้าโปรไฟล์แทน (ตรวจ currentPassword จริง)
  if (userId === ctx.userId) return { ok: false, reason: "SELF_RESET" };

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isProtectedAccount: true },
  });
  if (!target) return { ok: false, reason: "USER_NOT_FOUND" };

  // บัญชีคุ้มครอง: ADMIN รายอื่นตั้งรหัสให้ไม่ได้ — มิฉะนั้นจะ "เข้าระบบในชื่อเจ้าของบัญชี"
  // ได้ทันที ซึ่งอันตรายกว่าการลบบัญชีเสียอีก เพราะ Audit Log จะบันทึกว่าเป็นเจ้าตัวที่ทำ
  if (
    isBlockedByProtectedAccount({
      actorIsProtected: ctx.isProtectedAccount,
      targetIsProtected: target.isProtectedAccount,
      isSelf: false, // ถูกตัดด้วย SELF_RESET ไปแล้วด้านบน
    })
  ) {
    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.REJECT,
      entityType: "User",
      entityId: userId,
      changes: { blocked: "reset-password" satisfies ProtectedAction },
      reason: "protected-account-blocked",
    });
    return { ok: false, reason: "PROTECTED_ACCOUNT" };
  }

  const tempPassword = buildTempPassword(randomBytes(TEMP_PASSWORD_RANDOM_BYTES));

  try {
    // ตั้งธงบังคับเปลี่ยนรหัส "ก่อน" เปลี่ยนรหัสจริง — ถ้าขั้นถัดไปล้มเหลว
    // ผู้ใช้ยังใช้รหัสเดิมได้และแค่ถูกขอให้เปลี่ยน (ปลอดภัยกว่าสลับลำดับกัน
    // ซึ่งจะทำให้รหัสชั่วคราวใช้งานได้โดยไม่มีใครถูกบังคับให้เปลี่ยน)
    await prisma.user.update({
      where: { id: userId },
      data: { mustChangePassword: true },
    });

    const authCtx = await auth.$context;
    const hashed = await authCtx.password.hash(tempPassword);
    const accounts = await authCtx.internalAdapter.findAccounts(userId);
    const hasCredential = accounts.some((a) => a.providerId === "credential");
    if (hasCredential) {
      await authCtx.internalAdapter.updatePassword(userId, hashed);
    } else {
      // บัญชีที่ยังไม่เคยมี credential (ถูกสร้างด้วยช่องทางอื่น) — สร้างให้เพื่อให้ล็อกอินได้
      await authCtx.internalAdapter.createAccount({
        userId,
        providerId: "credential",
        accountId: userId,
        password: hashed,
      });
    }

    // ตัดทุกอุปกรณ์ที่ยังค้าง session อยู่ — รหัสเดิมถูกเปลี่ยนแล้วจึงต้องล็อกอินใหม่
    await authCtx.internalAdapter.deleteUserSessions(userId);
  } catch {
    // ไม่สะท้อนรายละเอียดภายในออกไป และไม่เขียนรหัสผ่านลง log เด็ดขาด
    return { ok: false, reason: "ERROR" };
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "UserCredential",
    entityId: userId,
    // บันทึกว่าเกิดอะไรขึ้น ไม่บันทึกค่ารหัสผ่าน (กฎ privacy CLAUDE.md)
    changes: { field: "password", by: "admin-temp-password" },
    reason: "admin-temp-password",
  });

  return { ok: true, tempPassword };
}

/**
 * ล้างธงบังคับเปลี่ยนรหัส — เรียกหลังผู้ใช้เปลี่ยนรหัสผ่านของตนเองสำเร็จ
 * แยกออกมาเพื่อให้ lib/profile/actions.ts เรียกได้โดยไม่ต้องรู้โครงสร้างธง
 */
export async function clearMustChangePassword(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, mustChangePassword: true },
    data: { mustChangePassword: false },
  });
}
