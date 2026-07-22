"use server";

import { headers } from "next/headers";
import { AuditAction } from "@prisma/client";
import { auth } from "./auth";
import { writeAuditLog } from "./audit/log";

/**
 * บันทึก Audit LOGOUT — เรียกจากปุ่มออกจากระบบ "ก่อน" signOut()
 * (ตอนนี้ session ยัง valid จึงอ่าน userId ได้ — ทำเป็น server action เพื่อไม่พึ่งพา
 *  hook ภายในของ Better Auth ที่อาจเปลี่ยนตามเวอร์ชัน)
 * best-effort: ถ้าไม่มี session หรือเขียนไม่สำเร็จ ก็ไม่ขวางการออกจากระบบ
 */
export async function recordLogout(): Promise<void> {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });
  if (!session) return;

  await writeAuditLog({
    userId: session.user.id,
    action: AuditAction.LOGOUT,
    entityType: "Session",
    entityId: session.session.id,
    ipAddress: hdrs.get("x-forwarded-for"),
    userAgent: hdrs.get("user-agent"),
  });
}
