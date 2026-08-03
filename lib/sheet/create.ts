// Core logic — ผู้คีย์เริ่มแบบสอบถามใบใหม่ ระบบออกรหัสให้ (Owner Decision 2026-08-03)
//
// Flow ใหม่ (แทนที่การลงทะเบียนใบล่วงหน้าโดยผู้รับเอกสาร):
//   ผู้คีย์เลือกชุมชน → กด "เริ่มกรอก" → ระบบออกรหัส SK-XXXXXX + จองใบให้
//   → ผู้คีย์เขียนรหัสลงบนกระดาษ → คีย์ข้อมูลต่อได้ทันที
//
// แยกจาก lib/entry/claim.ts เพราะเป็นคนละเรื่อง: ที่นี่คือ "สร้างใบใหม่"
// ส่วน claim.ts คือ "เปิดใบที่มีอยู่แล้ว"

import { SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { lockExpiryFrom } from "../entry/lock";
import { formatSheetNo } from "./number";

export interface StartSheetInput {
  /** ชุมชนที่ผู้คีย์เลือกจาก dropdown — แก้ไขภายหลังได้ ไม่ถูกฝังในรหัส */
  communityId: string;
}

export type StartSheetResult =
  | { ok: true; sheetId: string; sheetNo: string; communityName: string }
  | {
      ok: false;
      reason: "FORBIDDEN" | "INVALID_COMMUNITY" | "NUMBER_EXHAUSTED" | "ERROR";
    };

/** ดึงเลขรันถัดไปจาก SEQUENCE — กันซ้ำได้แม้เรียกพร้อมกัน โดยไม่ต้องล็อก */
async function nextRunningNumber(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT nextval('sheet_no_seq')::bigint AS n`;
    return Number(rows[0].n);
  } catch {
    // MAXVALUE 999999 + NO CYCLE → nextval() error เมื่อเลขเต็ม
    // ตั้งใจให้หยุดและแจ้งเตือน ดีกว่าวนกลับไปออกรหัสที่ใช้แล้ว
    return null;
  }
}

/**
 * เริ่มแบบสอบถามใบใหม่ — ออกรหัส สร้างใบ และจองให้ผู้คีย์ในขั้นตอนเดียว
 *
 * จองใบให้ทันทีเพราะผู้คีย์กำลังจะกรอกต่อ ถ้าไม่จองจะมีช่องให้คนอื่นแทรกเปิดใบนี้ได้
 */
export async function startSheet(
  ctx: AuthorizationContext,
  input: StartSheetInput,
): Promise<StartSheetResult> {
  if (!hasPermission(ctx, PERMISSIONS.SURVEY_ENTRY)) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  const community = await prisma.community.findFirst({
    where: { id: input.communityId, deletedAt: null, isActive: true },
    select: { id: true, nameTh: true },
  });
  if (!community) return { ok: false, reason: "INVALID_COMMUNITY" };

  const running = await nextRunningNumber();
  if (running === null) return { ok: false, reason: "NUMBER_EXHAUSTED" };

  const now = new Date();
  try {
    const sheet = await prisma.paperSheet.create({
      data: {
        communityId: community.id,
        sheetNo: formatSheetNo(running),
        // ปึกถูกยกเลิกจากระบบแล้ว — ใบใหม่ไม่มีปึกและไม่มีลำดับในปึกเสมอ
        batchId: null,
        sequence: null,
        status: SheetStatus.LOCKED,
        lockedById: ctx.userId,
        lockedAt: now,
        lockExpiresAt: lockExpiryFrom(now),
      },
      select: { id: true, sheetNo: true },
    });
    return {
      ok: true,
      sheetId: sheet.id,
      sheetNo: sheet.sheetNo,
      communityName: community.nameTh,
    };
  } catch {
    return { ok: false, reason: "ERROR" };
  }
}

/** ชุมชนที่เลือกได้ตอนเริ่มกรอก — ผู้คีย์เปิดใบชุมชนใดก็ได้ตามกระดาษที่ถืออยู่ */
export async function listSelectableCommunities(
  ctx: AuthorizationContext,
): Promise<{ id: string; nameTh: string }[]> {
  if (!hasPermission(ctx, PERMISSIONS.SURVEY_ENTRY)) return [];
  return prisma.community.findMany({
    where: { deletedAt: null, isActive: true },
    orderBy: { nameTh: "asc" },
    select: { id: true, nameTh: true },
  });
}
