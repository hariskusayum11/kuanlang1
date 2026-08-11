// Verification Queue core — testable (ctx-based, ไม่ import next/headers)
// ตรวจ permission + community scope ฝั่ง server เท่านั้น — ห้ามเชื่อ scope จาก client
// คิวและตัวเลขเป็น aggregate/summary — ไม่มี PII (ชื่อ/เบอร์/พิกัด) ตามกฎ privacy
//
// แสดงเป็นตารางแบนพร้อมค้นหา/กรอง/แบ่งหน้า เพื่อเข้าถึงทุกใบได้โดยตรง
//
// ขอบเขตที่เห็นมาจาก ctx เท่านั้น (permission + scope) — โมดูลนี้ไม่ตัดสินจากชื่อ Role

import { DuplicateResolutionEnum, Prisma, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { normalizePage, normalizePageSize } from "../pagination";

export function canVerify(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.VERIFICATION_VIEW);
}

export function verificationRowActions(input: {
  isAdmin: boolean;
  enteredByMe: boolean;
}) {
  return {
    canView: true,
    canConfirm: !input.enteredByMe,
    canEdit: input.isAdmin || !input.enteredByMe,
    canDelete: input.isAdmin,
  };
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

/** เงื่อนไขเดียวสำหรับคิวและ badge แจ้งเตือน เพื่อไม่ให้ตัวเลขสองจุดคลาดกัน */
export function buildWaitingVerificationWhere(
  ctx: AuthorizationContext,
): Prisma.HouseholdWhereInput | null {
  if (!canVerify(ctx)) return null;
  const scope = householdCommunityFilter(ctx);
  if (scope === null) return null;
  return {
    deletedAt: null,
    sheet: { status: SheetStatus.ENTERED_1 },
    AND: [
      {
        OR: [
          { duplicateResolution: null },
          { duplicateResolution: DuplicateResolutionEnum.NOT_DUPLICATE },
        ],
      },
    ],
    ...scope,
  };
}

export async function countWaitingVerification(
  ctx: AuthorizationContext,
): Promise<number> {
  const where = buildWaitingVerificationWhere(ctx);
  return where ? prisma.household.count({ where }) : 0;
}

export interface VerificationQueueItem {
  householdId: string;
  sheetNo: string;
  communityId: string;
  communityName: string;
  enteredAt: Date;
  enteredById: string;
  enteredByName: string;
  houseNo: string | null;
  mooNo: number | null;
  /** ผู้คีย์เป็นตัวเราเอง → UI ปิดปุ่มยืนยัน (แยกหน้าที่ผู้คีย์/ผู้ตรวจ) */
  enteredByMe: boolean;
  illegibleCount: number;
  blankCount: number;
  hasDuplicateFlag: boolean;
  duplicateResolution: "CONFIRMED_DUPLICATE" | "NOT_DUPLICATE" | null;
  vulnerableCount: number;
}

/** ตัวกรองที่ผู้ใช้เลือกได้ — ทั้งหมด optional (ไม่กรอง = เห็นตาม scope ทั้งหมด) */
export interface VerificationFilters {
  communityId?: string;
  enteredById?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface VerificationFilterOptions {
  communities: { id: string; nameTh: string }[];
  enterers: { id: string; name: string }[];
}

export interface VerificationOverview {
  allowed: boolean;
  waiting: number;
  verified: number;
  filteredTotal: number;
  /** จำนวน VERIFIED ที่ตรงกับตัวกรองเดียวกับตาราง ใช้กับการ์ดด้านบน */
  filteredVerified: number;
  page: number;
  pageSize: number;
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
  const page = normalizePage(filters.page);
  const pageSize = normalizePageSize(filters.pageSize);
  if (!canVerify(ctx)) {
    return { allowed: false, waiting: 0, verified: 0, filteredTotal: 0, filteredVerified: 0, page, pageSize, queue: [], filterOptions: EMPTY_FILTER_OPTIONS };
  }
  const scope = householdCommunityFilter(ctx);
  if (scope === null) {
    return { allowed: true, waiting: 0, verified: 0, filteredTotal: 0, filteredVerified: 0, page, pageSize, queue: [], filterOptions: EMPTY_FILTER_OPTIONS };
  }

  const waitingWhere = buildWaitingVerificationWhere(ctx)!;
  const filterClauses: Prisma.HouseholdWhereInput[] = [
    ...(filters.communityId ? [{ communityId: filters.communityId }] : []),
    ...(filters.enteredById ? [{ enteredById: filters.enteredById }] : []),
    ...(filters.search?.trim()
      ? [{ OR: [
          { sheet: { sheetNo: { contains: filters.search.trim(), mode: "insensitive" as const } } },
          { houseNo: { contains: filters.search.trim(), mode: "insensitive" as const } },
        ] }]
      : []),
  ];
  const filteredWhere: Prisma.HouseholdWhereInput = { AND: [waitingWhere, ...filterClauses] };
  const filteredVerifiedWhere: Prisma.HouseholdWhereInput = {
    AND: [
      { deletedAt: null, sheet: { status: SheetStatus.VERIFIED }, ...scope },
      { OR: [
        { duplicateResolution: null },
        { duplicateResolution: DuplicateResolutionEnum.NOT_DUPLICATE },
      ] },
      ...filterClauses,
    ],
  };

  const [waiting, verified, filteredTotal, filteredVerified, rows, communities, enterers] = await Promise.all([
    prisma.household.count({ where: waitingWhere }),
    prisma.household.count({
      where: { deletedAt: null, sheet: { status: SheetStatus.VERIFIED }, ...scope },
    }),
    prisma.household.count({ where: filteredWhere }),
    prisma.household.count({ where: filteredVerifiedWhere }),
    prisma.household.findMany({
      where: filteredWhere,
      select: {
        id: true,
        communityId: true,
        enteredById: true,
        enteredAt: true,
        houseNo: true,
        mooNo: true,
        illegibleCount: true,
        blankCount: true,
        hasDuplicateFlag: true,
        duplicateResolution: true,
        sheet: { select: { sheetNo: true } },
        community: { select: { nameTh: true } },
        enteredBy: { select: { name: true } },
        _count: { select: { vulnerablePersons: true } },
      },
      // ใบสงสัยซ้ำควรได้รับการตรวจก่อน จากนั้นเรียงตามคิวเข้า
      orderBy: [{ hasDuplicateFlag: "desc" }, { enteredAt: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
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
    filteredTotal,
    filteredVerified,
    page,
    pageSize,
    queue: rows.map((h) => ({
      householdId: h.id,
      sheetNo: h.sheet.sheetNo,
      communityId: h.communityId,
      communityName: h.community.nameTh,
      enteredAt: h.enteredAt,
      enteredById: h.enteredById,
      enteredByName: h.enteredBy.name,
      houseNo: h.houseNo,
      mooNo: h.mooNo,
      enteredByMe: h.enteredById === ctx.userId,
      illegibleCount: h.illegibleCount,
      blankCount: h.blankCount,
      hasDuplicateFlag: h.hasDuplicateFlag,
      duplicateResolution: h.duplicateResolution,
      vulnerableCount: h._count.vulnerablePersons,
    })),
    filterOptions: {
      communities: communities.map((c) => ({ id: c.communityId, nameTh: c.community.nameTh })),
      enterers: enterers.map((e) => ({ id: e.enteredById, name: e.enteredBy.name })),
    },
  };
}
