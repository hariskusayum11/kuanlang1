// รายงานสรุปการกรอกรายคน — สำหรับคิดค่ากรอก (เจ้าหน้าที่คีย์ข้อมูล)
// ---------------------------------------------------------------------------
// กติกาสำคัญ (CLAUDE.md):
// - RBAC ฝั่ง server (report.view) — OFFICER/COORDINATOR/EXECUTIVE/RESEARCHER/ADMIN
// - นับ "ทุกใบที่กรอก" (ยังไม่ลบ) รายคน แยกยอด "ตรวจผ่านแล้ว (VERIFIED)" ให้เห็นทั้งสองฐาน
//   → ให้ผู้ใช้เลือกฐานคิดเงินเอง (กรอกทั้งหมด หรือ เฉพาะที่ตรวจผ่าน)
// - ชื่อในรายงานคือ "เจ้าหน้าที่คีย์" (User.name) ไม่ใช่ PII ประชาชน · ตัวเลขเป็น aggregate
// - Export ต้องมี Audit EXPORT (เกี่ยวข้องกับการจ่ายเงิน — ต้องตรวจย้อนได้)
// - Community Scope ถูกยกเลิก (#R7-B) — คง where-builder รองรับ scope ไว้เผื่อเปิดกลับ

import { AuditAction, SheetStatus } from "@prisma/client";
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

export interface KeyerRow {
  enteredById: string;
  name: string;
  /** จำนวนใบที่กรอกทั้งหมด (ยังไม่ลบ) — ฐานคิดเงินแบบ "จ่ายตามงานที่ทำ" */
  total: number;
  /** จำนวนที่ตรวจผ่านแล้ว (VERIFIED) — ฐานคิดเงินแบบ "จ่ายเมื่อผ่าน QC" */
  verified: number;
  /** ยังไม่ผ่านตรวจ = total − verified */
  pending: number;
}

export interface KeyerReport {
  allowed: boolean;
  rows: KeyerRow[];
  totals: { total: number; verified: number; pending: number };
}

/**
 * รวมผลนับต่อคน — pure (ทดสอบได้) · join ยอดรวม + ยอด verified ด้วย enteredById
 * เรียงมากไปน้อยตามจำนวนที่กรอกทั้งหมด (คนที่กรอกเยอะขึ้นก่อน)
 */
export function mergeKeyerCounts(
  totals: { enteredById: string; count: number }[],
  verified: { enteredById: string; count: number }[],
  names: Map<string, string>,
): KeyerRow[] {
  const verifiedById = new Map(verified.map((v) => [v.enteredById, v.count]));
  return totals
    .map((t) => {
      const v = verifiedById.get(t.enteredById) ?? 0;
      return {
        enteredById: t.enteredById,
        name: names.get(t.enteredById) ?? "(ไม่พบชื่อ)",
        total: t.count,
        verified: v,
        pending: t.count - v,
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
    }),
    { total: 0, verified: 0, pending: 0 },
  );
}

/**
 * โหลดสรุปการกรอกรายคน — groupBy enteredById (ยอดรวม + ยอด VERIFIED) + Audit READ
 */
export async function getKeyerProductivity(
  ctx: AuthorizationContext,
): Promise<KeyerReport> {
  if (!canViewReports(ctx)) {
    return { allowed: false, rows: [], totals: { total: 0, verified: 0, pending: 0 } };
  }
  const scope = scopeFilter(ctx);
  if (scope === null) {
    return { allowed: true, rows: [], totals: { total: 0, verified: 0, pending: 0 } };
  }

  const [totalGroups, verifiedGroups] = await Promise.all([
    prisma.household.groupBy({
      by: ["enteredById"],
      where: { deletedAt: null, ...scope },
      _count: { _all: true },
    }),
    prisma.household.groupBy({
      by: ["enteredById"],
      where: { deletedAt: null, sheet: { status: SheetStatus.VERIFIED }, ...scope },
      _count: { _all: true },
    }),
  ]);

  const ids = totalGroups.map((g) => g.enteredById);
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name]));

  const rows = mergeKeyerCounts(
    totalGroups.map((g) => ({ enteredById: g.enteredById, count: g._count._all })),
    verifiedGroups.map((g) => ({ enteredById: g.enteredById, count: g._count._all })),
    names,
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
): Promise<KeyerRow[] | null> {
  if (!canViewReports(ctx)) return null;
  if (scopeFilter(ctx) === null) return null;

  const report = await getKeyerProductivity(ctx);
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
  "ยังไม่ผ่านตรวจ",
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
    lines.push([r.name, r.total, r.verified, r.pending].map(csvCell).join(","));
  }
  const totals = sumKeyerRows(rows);
  lines.push(["รวม", totals.total, totals.verified, totals.pending].map(csvCell).join(","));
  return lines.join("\r\n");
}
