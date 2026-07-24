// Verification Queue core — testable (ctx-based, ไม่ import next/headers)
// ตรวจ permission + community scope ฝั่ง server เท่านั้น — ห้ามเชื่อ scope จาก client
// คิวและตัวเลขเป็น aggregate/summary — ไม่มี PII (ชื่อ/เบอร์/พิกัด) ตามกฎ privacy

import { SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";

export function canVerify(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.VERIFICATION_VIEW);
}

/**
 * เงื่อนไข community scope สำหรับ query household
 * - Global scope → ไม่กรอง (เห็นทุกชุมชน)
 * - Scope ว่าง → null = ไม่มีสิทธิ์เห็นงานใด (ห้าม fallback เป็นทั้งระบบ)
 */
export function householdCommunityFilter(
  ctx: AuthorizationContext,
): { communityId?: { in: string[] } } | null {
  if (ctx.isGlobalScope) return {};
  if (ctx.communityIds.length === 0) return null;
  return { communityId: { in: ctx.communityIds } };
}

export interface VerificationQueueItem {
  householdId: string;
  sheetNo: string;
  communityName: string;
  batchCode: string;
  enteredAt: Date;
  /** ผู้คีย์เป็นตัวเราเอง → UI ปิดปุ่มยืนยัน (แยกหน้าที่ผู้คีย์/ผู้ตรวจ) */
  enteredByMe: boolean;
  illegibleCount: number;
  blankCount: number;
  hasDuplicateFlag: boolean;
  vulnerableCount: number;
}

export interface VerificationOverview {
  allowed: boolean;
  waiting: number;
  verified: number;
  queue: VerificationQueueItem[];
}

/**
 * ครัวเรือนที่รอตรวจ (sheet.status = ENTERED_1) ใน scope + ตัวเลข aggregate
 * denominator: waiting (รอตรวจ) / verified (ยืนยันแล้ว) — สำหรับแสดง Coverage
 */
export async function getVerificationOverview(
  ctx: AuthorizationContext,
): Promise<VerificationOverview> {
  if (!canVerify(ctx)) {
    return { allowed: false, waiting: 0, verified: 0, queue: [] };
  }
  const scope = householdCommunityFilter(ctx);
  if (scope === null) {
    return { allowed: true, waiting: 0, verified: 0, queue: [] };
  }

  const [waiting, verified, rows] = await Promise.all([
    prisma.household.count({
      where: { deletedAt: null, sheet: { status: SheetStatus.ENTERED_1 }, ...scope },
    }),
    prisma.household.count({
      where: { deletedAt: null, sheet: { status: SheetStatus.VERIFIED }, ...scope },
    }),
    prisma.household.findMany({
      where: { deletedAt: null, sheet: { status: SheetStatus.ENTERED_1 }, ...scope },
      select: {
        id: true,
        enteredById: true,
        enteredAt: true,
        illegibleCount: true,
        blankCount: true,
        hasDuplicateFlag: true,
        sheet: { select: { sheetNo: true, batch: { select: { code: true } } } },
        community: { select: { nameTh: true } },
        _count: { select: { vulnerablePersons: true } },
      },
      // ใบสงสัยซ้ำ + ฟิลด์อ่านไม่ออกมาก ควรได้รับการตรวจก่อน จากนั้นเรียงตามคิวเข้า
      orderBy: [{ hasDuplicateFlag: "desc" }, { enteredAt: "asc" }],
      take: 200,
    }),
  ]);

  return {
    allowed: true,
    waiting,
    verified,
    queue: rows.map((h) => ({
      householdId: h.id,
      sheetNo: h.sheet.sheetNo,
      communityName: h.community.nameTh,
      batchCode: h.sheet.batch.code,
      enteredAt: h.enteredAt,
      enteredByMe: h.enteredById === ctx.userId,
      illegibleCount: h.illegibleCount,
      blankCount: h.blankCount,
      hasDuplicateFlag: h.hasDuplicateFlag,
      vulnerableCount: h._count.vulnerablePersons,
    })),
  };
}
