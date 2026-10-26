// Household List core — รายการครัวเรือนที่ตรวจแล้ว (VERIFIED) + ค้น/กรอง/Export
// ---------------------------------------------------------------------------
// กติกาสำคัญ (CLAUDE.md):
// - RBAC ตรวจฝั่ง server เท่านั้น (household.view) — OFFICER/ADMIN
// - แสดงเฉพาะใบที่ VERIFIED · ไม่นับ soft-deleted / ใบสงสัยซ้ำ (เหมือน Verified Coverage)
// - Privacy: รายการ/Export คืน "เฉพาะฟิลด์โครงสร้าง" ที่ไม่ใช่ PII อ่อนไหว
//   (รหัสใบ, ที่อยู่ตามกระดาษ, ตัวนับ, ใคร/เมื่อไรคีย์-ตรวจ) — ไม่ถอดรหัส ชื่อ/เบอร์/พิกัด
//   ผู้ที่ต้องดู PII ให้เปิดหน้ารายละเอียด /verification/[id] (มี Audit READ รายใบ)
// - ทุกการเปิดดู/Export ต้องมี Audit Log — READ (เปิดรายการ) / EXPORT (ดาวน์โหลด CSV)
// - Community Scope ถูกยกเลิก (#R7-B) — คง where-builder ที่รองรับ scope ไว้เผื่อเปิดกลับ

import { AuditAction, Prisma, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { DEFAULT_PAGE_SIZE, normalizePage, normalizePageSize } from "../pagination";

export const HOUSEHOLD_PAGE_SIZE = DEFAULT_PAGE_SIZE;
/** เพดานจำนวนแถวที่ Export ได้ในครั้งเดียว — กัน dump ทั้งฐานในคำขอเดียว */
export const HOUSEHOLD_EXPORT_LIMIT = 5000;

export function canViewHouseholds(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.HOUSEHOLD_VIEW);
}

/** ตัวกรองที่ผู้ใช้เลือกได้ — ทั้งหมด optional (ไม่กรอง = เห็นทุกใบที่ VERIFIED ใน scope) */
export interface HouseholdListFilters {
  communityId?: string;
  tambonId?: string;
  /** ค้นจากรหัสใบ (SK-XXXXXX) หรือบ้านเลขที่ — ไม่ค้นในฟิลด์เข้ารหัส */
  search?: string;
}

/**
 * เงื่อนไข community scope — คงรูปแบบเดียวกับ verification/queue.ts
 * - Global scope → ไม่กรอง (เห็นทุกชุมชน) · Scope ว่าง → null = ไม่มีสิทธิ์เห็นใด
 */
function scopeFilter(
  ctx: AuthorizationContext,
): { communityId?: { in: string[] } } | null {
  if (ctx.isGlobalScope) return {};
  if (ctx.communityIds.length === 0) return null;
  return { communityId: { in: ctx.communityIds } };
}

/**
 * ประกอบ where สำหรับ "ครัวเรือนที่ตรวจแล้ว" — pure (คืน null เมื่อ scope ว่าง)
 * VERIFIED + ยังไม่ถูกลบ + ไม่ใช่ใบสงสัยซ้ำ (สอดคล้องนิยาม Verified Coverage)
 */
export function buildVerifiedWhere(
  ctx: AuthorizationContext,
  filters: HouseholdListFilters,
): Prisma.HouseholdWhereInput | null {
  const scope = scopeFilter(ctx);
  if (scope === null) return null;

  const search = filters.search?.trim();
  return {
    deletedAt: null,
    hasDuplicateFlag: false,
    sheet: { status: SheetStatus.VERIFIED },
    // ขอบเขตกับตัวกรองชุมชนต้องอยู่คนละเงื่อนไข (AND) — ถ้า spread ทั้งคู่ลงคีย์ communityId
    // ตัวกรองจาก URL จะเขียนทับขอบเขต ทำให้หัวหน้าชุมชนเลือกดูชุมชนอื่นได้ (พบตอนทำ docs/43)
    AND: [scope, ...(filters.communityId ? [{ communityId: filters.communityId }] : [])],
    ...(filters.tambonId ? { tambonId: filters.tambonId } : {}),
    ...(search
      ? {
          OR: [
            { sheet: { sheetNo: { contains: search, mode: "insensitive" } } },
            { houseNo: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

/** แถวในตาราง/CSV — เฉพาะฟิลด์โครงสร้าง ไม่มี PII อ่อนไหว (ชื่อ/เบอร์/พิกัด) */
export interface HouseholdListRow {
  householdId: string;
  sheetNo: string;
  communityName: string;
  tambonName: string | null;
  houseNo: string | null;
  mooNo: number | null;
  soi: string | null;
  road: string | null;
  memberCount: number | null;
  vulnerableCount: number;
  illegibleCount: number;
  blankCount: number;
  enteredByName: string;
  enteredAt: Date;
  verifiedByName: string | null;
  verifiedAt: Date | null;
}

export interface HouseholdListFilterOptions {
  communities: { id: string; nameTh: string }[];
  tambons: { id: string; nameTh: string }[];
}

export interface HouseholdListResult {
  allowed: boolean;
  rows: HouseholdListRow[];
  total: number;
  page: number;
  pageSize: number;
  filterOptions: HouseholdListFilterOptions;
}

const EMPTY_OPTIONS: HouseholdListFilterOptions = { communities: [], tambons: [] };

const ROW_SELECT = {
  id: true,
  houseNo: true,
  mooNo: true,
  soi: true,
  road: true,
  memberCount: true,
  illegibleCount: true,
  blankCount: true,
  enteredAt: true,
  verifiedAt: true,
  sheet: { select: { sheetNo: true } },
  community: { select: { nameTh: true } },
  tambon: { select: { nameTh: true } },
  moo: { select: { number: true } },
  enteredBy: { select: { name: true } },
  verifiedBy: { select: { name: true } },
  _count: { select: { vulnerablePersons: true } },
} satisfies Prisma.HouseholdSelect;

type RawRow = Prisma.HouseholdGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(h: RawRow): HouseholdListRow {
  return {
    householdId: h.id,
    sheetNo: h.sheet.sheetNo,
    communityName: h.community.nameTh,
    tambonName: h.tambon?.nameTh ?? null,
    houseNo: h.houseNo,
    // paper-first: ใช้เลขหมู่ดิบก่อน · fallback master Moo สำหรับใบเก่าที่ผูก FK ไว้
    mooNo: h.mooNo != null && h.mooNo > 0
      ? h.mooNo
      : h.moo?.number != null && h.moo.number > 0
        ? h.moo.number
        : null,
    soi: h.soi,
    road: h.road,
    memberCount: h.memberCount,
    vulnerableCount: h._count.vulnerablePersons,
    illegibleCount: h.illegibleCount,
    blankCount: h.blankCount,
    enteredByName: h.enteredBy.name,
    enteredAt: h.enteredAt,
    verifiedByName: h.verifiedBy?.name ?? null,
    verifiedAt: h.verifiedAt,
  };
}

/**
 * โหลดรายการครัวเรือนที่ตรวจแล้ว (แบ่งหน้า) + ตัวเลือกตัวกรอง + Audit READ
 * ไม่ถอดรหัส PII — จึงเขียน Audit READ ระดับ "เปิดรายการ" ครั้งเดียวต่อการโหลด
 */
export async function getVerifiedHouseholds(
  ctx: AuthorizationContext,
  filters: HouseholdListFilters = {},
  page = 1,
  requestedPageSize: number = HOUSEHOLD_PAGE_SIZE,
): Promise<HouseholdListResult> {
  const pageSize = normalizePageSize(requestedPageSize);
  if (!canViewHouseholds(ctx)) {
    return { allowed: false, rows: [], total: 0, page: 1, pageSize, filterOptions: EMPTY_OPTIONS };
  }
  const where = buildVerifiedWhere(ctx, filters);
  if (where === null) {
    return { allowed: true, rows: [], total: 0, page: 1, pageSize, filterOptions: EMPTY_OPTIONS };
  }

  // ตัวเลือกตัวกรอง: distinct ภายใน scope (ไม่ผูกกับตัวกรองปัจจุบัน เพื่อสลับไปมาได้)
  const scopeWhere = buildVerifiedWhere(ctx, {}) ?? {};
  const safePage = normalizePage(page);

  const [total, rows, communities, tambons] = await Promise.all([
    prisma.household.count({ where }),
    prisma.household.findMany({
      where,
      select: ROW_SELECT,
      orderBy: [{ verifiedAt: "desc" }, { enteredAt: "desc" }],
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.household.findMany({
      where: scopeWhere,
      distinct: ["communityId"],
      select: { communityId: true, community: { select: { nameTh: true } } },
      orderBy: { community: { nameTh: "asc" } },
    }),
    prisma.household.findMany({
      where: { ...scopeWhere, tambonId: { not: null } },
      distinct: ["tambonId"],
      select: { tambonId: true, tambon: { select: { nameTh: true } } },
      orderBy: { tambon: { nameTh: "asc" } },
    }),
  ]);

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "HouseholdList",
    reason: "verified-household-list",
    changes: { count: rows.length, page: safePage },
  });

  return {
    allowed: true,
    rows: rows.map(toRow),
    total,
    page: safePage,
    pageSize,
    filterOptions: {
      communities: communities.map((c) => ({ id: c.communityId, nameTh: c.community.nameTh })),
      tambons: tambons
        .filter((t): t is typeof t & { tambonId: string } => t.tambonId != null)
        .map((t) => ({ id: t.tambonId, nameTh: t.tambon?.nameTh ?? "—" })),
    },
  };
}

/**
 * โหลดทุกแถวที่ตรงตัวกรองสำหรับ Export (ไม่แบ่งหน้า, มีเพดาน) + Audit EXPORT
 * คืน null เมื่อไม่มีสิทธิ์/scope ว่าง — ให้ผู้เรียก (route) ตอบ 403
 */
export async function exportVerifiedHouseholds(
  ctx: AuthorizationContext,
  filters: HouseholdListFilters = {},
): Promise<HouseholdListRow[] | null> {
  if (!canViewHouseholds(ctx)) return null;
  const where = buildVerifiedWhere(ctx, filters);
  if (where === null) return null;

  const rows = await prisma.household.findMany({
    where,
    select: ROW_SELECT,
    orderBy: [{ verifiedAt: "desc" }, { enteredAt: "desc" }],
    take: HOUSEHOLD_EXPORT_LIMIT,
  });

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.EXPORT,
    entityType: "HouseholdList",
    reason: "verified-household-csv",
    changes: { count: rows.length },
  });

  return rows.map(toRow);
}

// --- CSV (pure) -------------------------------------------------------------

const CSV_HEADERS = [
  "รหัสแบบสอบถาม",
  "ชุมชน",
  "ตำบล",
  "บ้านเลขที่",
  "หมู่ที่",
  "ซอย",
  "ถนน",
  "จำนวนสมาชิก",
  "กลุ่มเปราะบาง(คน)",
  "อ่านไม่ออก",
  "ว่างในกระดาษ",
  "บันทึกโดย",
  "วันที่บันทึก",
  "ตรวจโดย",
  "วันที่ตรวจ",
] as const;

/** escape ค่าเดียวตามกติกา CSV (RFC 4180) — ครอบด้วย " เมื่อมี " , \n \r */
function csvCell(value: string | number | null): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** วันที่แบบ YYYY-MM-DD (เสถียร ไม่พึ่ง locale) สำหรับ CSV */
function csvDate(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * สร้าง CSV จากแถว — pure (ทดสอบได้) · ไม่ใส่ BOM ที่นี่ (route เป็นผู้เติมให้ Excel)
 * คอลัมน์ทั้งหมดเป็นฟิลด์โครงสร้าง ไม่มี PII อ่อนไหว
 */
export function buildHouseholdsCsv(rows: HouseholdListRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.sheetNo,
        r.communityName,
        r.tambonName,
        r.houseNo,
        r.mooNo,
        r.soi,
        r.road,
        r.memberCount,
        r.vulnerableCount,
        r.illegibleCount,
        r.blankCount,
        r.enteredByName,
        csvDate(r.enteredAt),
        r.verifiedByName,
        csvDate(r.verifiedAt),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n");
}
