// รายงานสรุปการกรอกรายคน — สำหรับคิดค่ากรอก (เจ้าหน้าที่คีย์ข้อมูล)
// ---------------------------------------------------------------------------
// กติกาสำคัญ (CLAUDE.md):
// - RBAC ฝั่ง server (report.view) — OFFICER/COORDINATOR/EXECUTIVE/RESEARCHER/ADMIN
// - นับ "ทุกใบที่กรอก" (ยังไม่ลบ) รายคน แยกยอด "ตรวจผ่านแล้ว (VERIFIED)" ให้เห็นทั้งสองฐาน
//   → ให้ผู้ใช้เลือกฐานคิดเงินเอง (กรอกทั้งหมด หรือ เฉพาะที่ตรวจผ่าน)
// - ชื่อในรายงานคือ "เจ้าหน้าที่คีย์" (User.name) ไม่ใช่ PII ประชาชน · ตัวเลขเป็น aggregate
// - Export ต้องมี Audit EXPORT (เกี่ยวข้องกับการจ่ายเงิน — ต้องตรวจย้อนได้)
// - Community Scope ถูกยกเลิก (#R7-B) — คง where-builder รองรับ scope ไว้เผื่อเปิดกลับ

import { AuditAction, DuplicateResolutionEnum, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";

export function canViewReports(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.REPORT_VIEW);
}

/** เงื่อนไข scope — คงรูปแบบเดียวกับโมดูลอื่น (null = ไม่มีสิทธิ์เห็นใด) */
function scopeFilter(
  ctx: AuthorizationContext,
): { communityId?: { in: string[] } } | null {
  if (ctx.isGlobalScope) return {};
  if (ctx.communityIds.length === 0) return null;
  return { communityId: { in: ctx.communityIds } };
}

/** ใบหนึ่งใบที่คนคนนี้กรอก — ใช้กดดูรายละเอียดว่ากรอกใบไหนไปบ้าง */
export interface KeyerSheet {
  householdId: string;
  sheetNo: string;
  status: "VERIFIED" | "READY" | "EDITING" | "DUPLICATE";
}

export interface KeyerRow {
  enteredById: string;
  name: string;
  /** จำนวนใบที่กรอกทั้งหมด (ยังไม่ลบ) — ฐานคิดเงินแบบ "จ่ายตามงานที่ทำ" */
  total: number;
  /** จำนวนที่ตรวจผ่านแล้ว (VERIFIED) — ฐานคิดเงินแบบ "จ่ายเมื่อผ่าน QC" */
  verified: number;
  /** พร้อมอยู่ในคิวตรวจ */
  ready: number;
  /** ยังอยู่ระหว่างกรอกหรือเปิดแก้ไข */
  editing: number;
  /** ผู้ตรวจยืนยันแล้วว่าเป็นใบซ้ำจริง */
  duplicates: number;
  /** ยังไม่ผ่านตรวจ = พร้อมตรวจ + กำลังแก้ไข */
  pending: number;
  /** รายการใบที่กรอก (รหัส SK) — กดดูได้ว่ากรอกใบไหนไปบ้าง */
  sheets: KeyerSheet[];
}

export interface KeyerReport {
  allowed: boolean;
  rows: KeyerRow[];
  totals: {
    total: number;
    verified: number;
    ready: number;
    editing: number;
    duplicates: number;
    pending: number;
  };
}

export interface KeyerProductivityFilters {
  dateFrom?: string;
  dateTo?: string;
}

function enteredAtFilter(filters: KeyerProductivityFilters) {
  const from = filters.dateFrom
    ? new Date(`${filters.dateFrom}T00:00:00+07:00`)
    : undefined;
  const to = filters.dateTo
    ? new Date(`${filters.dateTo}T00:00:00+07:00`)
    : undefined;
  if (to) to.setDate(to.getDate() + 1);
  return from || to
    ? { enteredAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } }
    : {};
}

/**
 * รวมผลนับต่อคน — pure (ทดสอบได้) · join ยอดรวม + ยอด verified ด้วย enteredById
 * เรียงมากไปน้อยตามจำนวนที่กรอกทั้งหมด (คนที่กรอกเยอะขึ้นก่อน)
 */
export function mergeKeyerCounts(
  totals: { enteredById: string; count: number }[],
  verified: { enteredById: string; count: number }[],
  names: Map<string, string>,
  sheetsByKeyer?: Map<string, KeyerSheet[]>,
  breakdown: {
    ready?: { enteredById: string; count: number }[];
    duplicates?: { enteredById: string; count: number }[];
  } = {},
): KeyerRow[] {
  const verifiedById = new Map(verified.map((v) => [v.enteredById, v.count]));
  const readyById = new Map((breakdown.ready ?? []).map((v) => [v.enteredById, v.count]));
  const duplicatesById = new Map((breakdown.duplicates ?? []).map((v) => [v.enteredById, v.count]));
  return totals
    .map((t) => {
      const v = verifiedById.get(t.enteredById) ?? 0;
      const ready = readyById.get(t.enteredById) ?? 0;
      const duplicates = duplicatesById.get(t.enteredById) ?? 0;
      const editing = Math.max(0, t.count - v - ready - duplicates);
      return {
        enteredById: t.enteredById,
        name: names.get(t.enteredById) ?? "(ไม่พบชื่อ)",
        total: t.count,
        verified: v,
        ready,
        editing,
        duplicates,
        pending: ready + editing,
        sheets: sheetsByKeyer?.get(t.enteredById) ?? [],
      };
    })
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "th"));
}

/** ผลรวมทุกคน — pure */
export function sumKeyerRows(rows: KeyerRow[]): KeyerReport["totals"] {
  return rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      verified: acc.verified + r.verified,
      pending: acc.pending + r.pending,
      ready: acc.ready + r.ready,
      editing: acc.editing + r.editing,
      duplicates: acc.duplicates + r.duplicates,
    }),
    { total: 0, verified: 0, ready: 0, editing: 0, duplicates: 0, pending: 0 },
  );
}

/**
 * โหลดสรุปการกรอกรายคน — groupBy enteredById (ยอดรวม + ยอด VERIFIED) + Audit READ
 */
export async function getKeyerProductivity(
  ctx: AuthorizationContext,
  filters: KeyerProductivityFilters = {},
): Promise<KeyerReport> {
  if (!canViewReports(ctx)) {
    return { allowed: false, rows: [], totals: sumKeyerRows([]) };
  }
  const scope = scopeFilter(ctx);
  if (scope === null) {
    return { allowed: true, rows: [], totals: sumKeyerRows([]) };
  }

  // ใบที่สงสัยซ้ำยังเป็นผลงานและต้องรอตรวจตามปกติ
  // ตัดออกจากรายงานเมื่อผู้ตรวจยืนยันว่าเป็นใบซ้ำจริงแล้วเท่านั้น
  const notConfirmedDuplicate = {
    OR: [
      { duplicateResolution: null },
      { duplicateResolution: DuplicateResolutionEnum.NOT_DUPLICATE },
    ],
  };
  const dateWhere = enteredAtFilter(filters);

  const [totalGroups, verifiedGroups, readyGroups, duplicateGroups] = await Promise.all([
    prisma.household.groupBy({
      by: ["enteredById"],
      where: { deletedAt: null, ...dateWhere, ...scope },
      _count: { _all: true },
    }),
    prisma.household.groupBy({
      by: ["enteredById"],
      where: {
        deletedAt: null,
        sheet: { status: SheetStatus.VERIFIED },
        ...notConfirmedDuplicate,
        ...dateWhere,
        ...scope,
      },
      _count: { _all: true },
    }),
    prisma.household.groupBy({
      by: ["enteredById"],
      where: {
        deletedAt: null,
        sheet: { status: SheetStatus.ENTERED_1 },
        ...notConfirmedDuplicate,
        ...dateWhere,
        ...scope,
      },
      _count: { _all: true },
    }),
    prisma.household.groupBy({
      by: ["enteredById"],
      where: {
        deletedAt: null,
        duplicateResolution: DuplicateResolutionEnum.CONFIRMED_DUPLICATE,
        ...dateWhere,
        ...scope,
      },
      _count: { _all: true },
    }),
  ]);

  const ids = totalGroups.map((g) => g.enteredById);
  const [users, households] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    }),
    // รายการใบต่อคน (กดดูได้ว่ากรอกใบไหนบ้าง) — เรียงตามรหัสใบ
    prisma.household.findMany({
      where: { deletedAt: null, ...dateWhere, ...scope },
      select: {
        id: true,
        enteredById: true,
        duplicateResolution: true,
        sheet: { select: { sheetNo: true, status: true } },
      },
      orderBy: { sheet: { sheetNo: "asc" } },
    }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));

  const sheetsByKeyer = new Map<string, KeyerSheet[]>();
  for (const h of households) {
    const list = sheetsByKeyer.get(h.enteredById) ?? [];
    list.push({
      householdId: h.id,
      sheetNo: h.sheet.sheetNo,
      status: h.duplicateResolution === DuplicateResolutionEnum.CONFIRMED_DUPLICATE
        ? "DUPLICATE"
        : h.sheet.status === SheetStatus.VERIFIED
          ? "VERIFIED"
          : h.sheet.status === SheetStatus.ENTERED_1
            ? "READY"
            : "EDITING",
    });
    sheetsByKeyer.set(h.enteredById, list);
  }

  const rows = mergeKeyerCounts(
    totalGroups.map((g) => ({ enteredById: g.enteredById, count: g._count._all })),
    verifiedGroups.map((g) => ({ enteredById: g.enteredById, count: g._count._all })),
    names,
    sheetsByKeyer,
    {
      ready: readyGroups.map((g) => ({ enteredById: g.enteredById, count: g._count._all })),
      duplicates: duplicateGroups.map((g) => ({ enteredById: g.enteredById, count: g._count._all })),
    },
  );

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "KeyerProductivityReport",
    reason: "keyer-productivity",
    changes: { keyers: rows.length },
  });

  return { allowed: true, rows, totals: sumKeyerRows(rows) };
}

/** โหลดข้อมูลสำหรับ Export + Audit EXPORT — คืน null เมื่อไม่มีสิทธิ์/scope ว่าง */
export async function exportKeyerProductivity(
  ctx: AuthorizationContext,
  filters: KeyerProductivityFilters = {},
): Promise<KeyerRow[] | null> {
  if (!canViewReports(ctx)) return null;
  if (scopeFilter(ctx) === null) return null;

  const report = await getKeyerProductivity(ctx, filters);
  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.EXPORT,
    entityType: "KeyerProductivityReport",
    reason: "keyer-productivity-csv",
    changes: { keyers: report.rows.length },
  });
  return report.rows;
}

// --- CSV (pure) -------------------------------------------------------------

const CSV_HEADERS = [
  "คนกรอก",
  "กรอกทั้งหมด",
  "ตรวจผ่านแล้ว",
  "พร้อมตรวจ",
  "กำลังแก้ไข",
  "ซ้ำจริง",
] as const;

function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** สร้าง CSV สรุปการกรอกรายคน — pure · route เป็นผู้เติม BOM */
export function buildKeyerCsv(rows: KeyerRow[]): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    lines.push([r.name, r.total, r.verified, r.ready, r.editing, r.duplicates].map(csvCell).join(","));
  }
  const totals = sumKeyerRows(rows);
  lines.push([
    "รวม",
    totals.total,
    totals.verified,
    totals.ready,
    totals.editing,
    totals.duplicates,
  ].map(csvCell).join(","));
  return lines.join("\r\n");
}
