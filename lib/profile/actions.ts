"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { AuditAction } from "@prisma/client";
import { auth } from "../auth";
import { getAuthorizationContext } from "../authz/context";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { clearMustChangePassword } from "../admin/user-password";
import { passwordChangeSchema, profileInfoSchema } from "./schema";

// รูปแบบ state สำหรับ useActionState — คืน error/ok กลับไปแสดง inline ที่ฟอร์ม
export type ProfileFormState = { ok: boolean; error?: string; saved?: boolean };

const NOT_AUTHENTICATED: ProfileFormState = {
  ok: false,
  error: "กรุณาเข้าสู่ระบบใหม่",
};

/**
 * แก้ข้อมูลส่วนตัวของผู้ใช้ที่ล็อกอินอยู่ (ชื่อ-นามสกุล + เบอร์โทร)
 * - RBAC: ต้องล็อกอิน และแก้ได้เฉพาะบัญชีตนเอง (อ้าง ctx.userId เสมอ ไม่รับ id จาก client)
 * - Audit: บันทึกว่า field ใดเปลี่ยน โดย "ไม่" log ค่า ชื่อ/เบอร์ จริง (กฎ privacy CLAUDE.md)
 */
export async function updateMyProfileAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return NOT_AUTHENTICATED;

  const parsed = profileInfoSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }

  const nextPhone = parsed.data.phone ?? null;
  const before = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: { name: true, phone: true },
  });

  await prisma.user.update({
    where: { id: ctx.userId },
    data: { name: parsed.data.name, phone: nextPhone },
  });

  // เก็บเฉพาะรายชื่อ field ที่เปลี่ยน — ห้ามใส่ค่า PII ดิบลง audit
  const changedFields: string[] = [];
  if (before?.name !== parsed.data.name) changedFields.push("name");
  if ((before?.phone ?? null) !== nextPhone) changedFields.push("phone");
  if (changedFields.length > 0) {
    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entityType: "User",
      entityId: ctx.userId,
      changes: { fields: changedFields },
      reason: "profile-self-update",
    });
  }

  // ชื่อผู้ใช้แสดงบน header (อ่านสดจาก DB ทุก request) → รีเฟรชหน้าให้เห็นค่าล่าสุด
  revalidatePath("/profile");
  return { ok: true, saved: true };
}

/**
 * เปลี่ยนรหัสผ่านของตนเองขณะล็อกอิน
 * - ใช้ auth.api.changePassword ของ Better Auth: ตรวจ currentPassword กับ hash จริงฝั่ง server
 * - revokeOtherSessions: เตะอุปกรณ์อื่นออก (เหลือเฉพาะเครื่องปัจจุบัน) เพื่อความปลอดภัย
 * - Audit: บันทึกการเปลี่ยนรหัส โดยไม่แตะเนื้อหารหัสผ่าน
 */
export async function changeMyPasswordAction(
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return NOT_AUTHENTICATED;

  const parsed = passwordChangeSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง" };
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch {
    // Better Auth โยน error เมื่อรหัสผ่านปัจจุบันไม่ถูกต้อง — ไม่เปิดเผยรายละเอียด/เนื้อหารหัส
    return { ok: false, error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  }

  // เปลี่ยนรหัสเองสำเร็จ = หมดเงื่อนไขของรหัสชั่วคราวที่ ADMIN ตั้งให้
  // ต้องล้างธงที่นี่ มิฉะนั้นผู้ใช้จะถูกเด้งกลับมาหน้านี้ซ้ำไม่รู้จบ
  await clearMustChangePassword(ctx.userId);

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "UserCredential",
    entityId: ctx.userId,
    reason: "password-self-change",
  });

  // layout อ่านธงนี้ทุก request — ต้องให้หน้าเรนเดอร์ใหม่ ไม่งั้นแถบเตือนยังค้าง
  revalidatePath("/profile");
  return { ok: true, saved: true };
}
