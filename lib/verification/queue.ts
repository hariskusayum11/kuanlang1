// Verification Queue core — testable (ctx-based, ไม่ import next/headers)
// ตรวจ permission + community scope ฝั่ง server เท่านั้น — ห้ามเชื่อ scope จาก client
// คิวและตัวเลขเป็น aggregate/summary — ไม่มี PII (ชื่อ/เบอร์/พิกัด) ตามกฎ privacy
//
// ผู้ตรวจที่เห็นได้กว้าง (หลายชุมชน) จะได้คิวเป็นกองเดียวจนไล่ตรวจยาก
// จึงจัดกลุ่มเป็น ชุมชน → ปึก → คนกรอก (ดู domain/verification/group-queue.ts)
// พร้อมตัวกรองให้ narrow ได้เมื่อคิวยาว
//
// ขอบเขตที่เห็นมาจาก ctx เท่านั้น (permission + scope) — โมดูลนี้ไม่ตัดสินจากชื่อ Role

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
  communityId: string;
  communityName: string;
  enteredAt: Date;
  enteredById: string;
  enteredByName: string;
  /** ผู้คีย์เป็นตัวเราเอง → UI ปิดปุ่มยืนยัน (แยกหน้าที่ผู้คีย์/ผู้ตรวจ) */
  enteredByMe: boolean;
  illegibleCount: number;
  blankCount: number;
  hasDuplicateFlag: boolean;
  vulnerableCount: number;
}

/** ตัวกรองที่ผู้ใช้เลือกได้ — ทั้งหมด optional (ไม่กรอง = เห็นตาม scope ทั้งหมด) */
export interface VerificationFilters {
  communityId?: string;
  enteredById?: string;
}

export interface VerificationFilterOptions {
  communities: { id: string; nameTh: string }[];
  enterers: { id: string; name: string }[];
}

export interface VerificationOverview {
  allowed: boolean;
  waiting: number;
  verified: number;
  queue: VerificationQueueItem[];
  filterOptions: VerificationFilterOptions;
}

const EMPTY_FILTER_OPTIONS: VerificationFilterOptions = {
  communities: [],
  enterers: [],
};

/**
 * ครัวเรือนที่รอตรวจ (sheet.status = ENTERED_1) ใน scope + ตัวเลข aggregate
 * denominator: waiting (รอตรวจ) / verified (ยืนยันแล้ว) — สำหรับแสดง Coverage
 */
export async function getVerificationOverview(
  ctx: AuthorizationContext,
  filters: VerificationFilters = {},
): Promise<VerificationOverview> {
  if (!canVerify(ctx)) {
    return { allowed: false, waiting: 0, verified: 0, queue: [], filterOptions: EMPTY_FILTER_OPTIONS };
  }
  const scope = householdCommunityFilter(ctx);
  if (scope === null) {
    return { allowed: true, waiting: 0, verified: 0, queue: [], filterOptions: EMPTY_FILTER_OPTIONS };
  }

  const waitingWhere = {
    deletedAt: null,
    sheet: { status: SheetStatus.ENTERED_1 },
    ...scope,
  };
  const filteredWhere = {
    ...waitingWhere,
    ...(filters.communityId ? { communityId: filters.communityId } : {}),
    ...(filters.enteredById ? { enteredById: filters.enteredById } : {}),
  };

  const [waiting, verified, rows, communities, enterers] = await Promise.all([
    prisma.household.count({ where: waitingWhere }),
    prisma.household.count({
      where: { deletedAt: null, sheet: { status: SheetStatus.VERIFIED }, ...scope },
    }),
    prisma.household.findMany({
      where: filteredWhere,
      select: {
        id: true,
        communityId: true,
        enteredById: true,
        enteredAt: true,
        illegibleCount: true,
        blankCount: true,
        hasDuplicateFlag: true,
        sheet: { select: { sheetNo: true } },
        community: { select: { nameTh: true } },
        enteredBy: { select: { name: true } },
        _count: { select: { vulnerablePersons: true } },
      },
      // ใบสงสัยซ้ำ + ฟิลด์อ่านไม่ออกมาก ควรได้รับการตรวจก่อน จากนั้นเรียงตามคิวเข้า
      // (ลำดับนี้คงอยู่ภายในแต่ละกลุ่มหลัง groupVerificationQueue — ไม่ถูกจัดเรียงซ้ำ)
      orderBy: [{ hasDuplicateFlag: "desc" }, { enteredAt: "asc" }],
      take: 200,
    }),
    // ตัวเลือกตัวกรอง: distinct ภายใน scope เดิม (ไม่ใช่ผลลัพธ์ที่กรองแล้ว)
    // เพื่อให้ยังสลับตัวกรองไปมาได้โดยตัวเลือกไม่หายไป
    prisma.household.findMany({
      where: waitingWhere,
      distinct: ["communityId"],
      select: { communityId: true, community: { select: { nameTh: true } } },
      orderBy: { community: { nameTh: "asc" } },
    }),
    prisma.household.findMany({
      where: waitingWhere,
      distinct: ["enteredById"],
      select: { enteredById: true, enteredBy: { select: { name: true } } },
      orderBy: { enteredBy: { name: "asc" } },
    }),
  ]);

  return {
    allowed: true,
    waiting,
    verified,
    queue: rows.map((h) => ({
      householdId: h.id,
      sheetNo: h.sheet.sheetNo,
      communityId: h.communityId,
      communityName: h.community.nameTh,
      enteredAt: h.enteredAt,
      enteredById: h.enteredById,
      enteredByName: h.enteredBy.name,
      enteredByMe: h.enteredById === ctx.userId,
      illegibleCount: h.illegibleCount,
      blankCount: h.blankCount,
      hasDuplicateFlag: h.hasDuplicateFlag,
      vulnerableCount: h._count.vulnerablePersons,
    })),
    filterOptions: {
      communities: communities.map((c) => ({ id: c.communityId, nameTh: c.community.nameTh })),
      enterers: enterers.map((e) => ({ id: e.enteredById, name: e.enteredBy.name })),
    },
  };
}
