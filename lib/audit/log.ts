import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "../prisma";

// ตัวช่วยเขียน Audit Log กลาง — ใช้ซ้ำได้ทุกจุด (login/logout, verifier edit ฯลฯ)
// กติกา (CLAUDE.md): Audit Log ต้องเป็น Append-only และห้าม Log PII (ชื่อ/เบอร์/สุขภาพ/พิกัด)
// จึงเก็บเฉพาะ userId, การกระทำ, entity อ้างอิง และ metadata ที่ปลอดภัย
// ตัวเรียกที่ต้องการเก็บ diff (เช่น การแก้ไขของ Verifier) ส่ง changes เป็น { field: { old, new } }
// โดยผู้เรียกต้องรับผิดชอบไม่ใส่ค่า PII ดิบลงใน changes สำหรับ log ที่ไม่ได้เข้ารหัส

export interface AuditLogInput {
  /** ผู้กระทำ (null = ระบบ) */
  userId?: string | null;
  action: AuditAction;
  /** ชื่อ Entity เช่น "Session", "Household" */
  entityType: string;
  entityId?: string | null;
  /** รายละเอียดที่เปลี่ยน (old → new) — ผู้เรียกต้องไม่ใส่ PII ดิบ */
  changes?: Prisma.InputJsonValue;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * เขียน Audit Log แบบ best-effort — การ log ล้มเหลวต้อง "ไม่" บล็อกการทำงานหลัก
 * (เช่น ถ้า DB audit ล่มต้องไม่ทำให้ผู้ใช้ login/logout ไม่ได้ หรือกลายเป็นช่อง DoS)
 * ไม่โยน error ออกไป และไม่ log เนื้อหา error ที่อาจมี PII
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        changes: input.changes,
        reason: input.reason ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  } catch {
    // ตั้งใจกลืน error — log แค่ context ที่ปลอดภัย ไม่มี PII และไม่มีรายละเอียด error
    console.error("[audit] เขียน AuditLog ไม่สำเร็จ", {
      action: input.action,
      entityType: input.entityType,
    });
  }
}
