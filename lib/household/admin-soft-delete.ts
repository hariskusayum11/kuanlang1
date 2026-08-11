// Household Admin — ลบ/กู้คืนแบบสอบถาม (Soft Delete — Owner Decision 2026-08-07)
// ---------------------------------------------------------------------------
// ข้อตกลง (จากคำตอบเจ้าของระบบ):
//  - เฉพาะ ADMIN เท่านั้นที่มีสิทธิ์ แก้ไข/ลบ แบบสอบถาม — role อื่นดูได้อย่างเดียว
//  - ลบ = soft delete (ตั้ง deletedAt) — ใบหายจาก coverage/risk/รายงาน/คิวตรวจ
//    ทันที แต่ยังดู/กู้คืนได้ (กติกา BR-29: ห้าม Hard Delete เว้นแต่ PDPA)
//  - กู้คืน = เคลียร์ deletedAt กลับสู่สถานะเดิมตามข้อมูล
//  - ทุกการลบ/กู้คืนต้องมี Audit Log (ผู้กระทำ/เวลา/เหตุผลกระบวนการ)
//
// ระบบฝั่งอื่นกรอง `deletedAt: null` อยู่แล้ว (Verified Coverage, Risk List,
// Household List, Verification Queue) จึงไม่มีตัวเลขเพี้ยนจากการลบ

import { AuditAction } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { normalizePage, normalizePageSize } from "../pagination";

/** เฉพาะ ADMIN — ตรวจฝั่ง server (การซ่อนปุ่มไม่ใช่ Authorization) */
function canManageSheets(ctx: AuthorizationContext): boolean {
  return (
    hasPermission(ctx, PERMISSIONS.HOUSEHOLD_VIEW) &&
    ctx.roles.includes("ADMIN")
  );
}

export type SoftDeleteHouseholdResult =
  | { ok: true; householdId: string }
  | {
      ok: false;
      reason: "NOT_ALLOWED" | "NOT_FOUND" | "ALREADY_DELETED" | "ERROR";
    };

/**
 * ลบแบบสอบถาม (soft delete)
 * - ตั้ง deletedAt บน Household — กรองออกจากทุกหน้าอัตโนมัติ
 * - ใบยังคงสถานะเดิม (VERIFIED/ENTERED_1) — กู้เมื่อไหร่กลับมาทันที
 * - Audit DELETE เก็บผู้ลบ/เวลา
 */
export async function softDeleteHousehold(
  ctx: AuthorizationContext,
  householdId: string,
): Promise<SoftDeleteHouseholdResult> {
  if (!canManageSheets(ctx)) return { ok: false, reason: "NOT_ALLOWED" };

  const h = await prisma.household.findUnique({
    where: { id: householdId },
    select: { id: true, deletedAt: true },
  });
  if (!h) return { ok: false, reason: "NOT_FOUND" };
  if (h.deletedAt) return { ok: false, reason: "ALREADY_DELETED" };

  try {
    await prisma.household.update({
      where: { id: householdId },
      data: { deletedAt: new Date() },
    });
  } catch {
    return { ok: false, reason: "ERROR" };
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.DELETE,
    entityType: "Household",
    entityId: householdId,
    changes: { deleted: true, reason: "admin-soft-delete" },
  });

  return { ok: true, householdId };
}

export type RestoreHouseholdResult =
  | { ok: true; householdId: string }
  | { ok: false; reason: "NOT_ALLOWED" | "NOT_FOUND" | "NOT_DELETED" | "ERROR" };

/** กู้คืนแบบสอบถามที่ถูกลบ (soft delete) — เคลียร์ deletedAt + Audit */
export async function restoreHousehold(
  ctx: AuthorizationContext,
  householdId: string,
): Promise<RestoreHouseholdResult> {
  if (!canManageSheets(ctx)) return { ok: false, reason: "NOT_ALLOWED" };

  const h = await prisma.household.findUnique({
    where: { id: householdId },
    select: { id: true, deletedAt: true },
  });
  if (!h) return { ok: false, reason: "NOT_FOUND" };
  if (!h.deletedAt) return { ok: false, reason: "NOT_DELETED" };

  try {
    await prisma.household.update({
      where: { id: householdId },
      data: { deletedAt: null },
    });
  } catch {
    return { ok: false, reason: "ERROR" };
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "Household",
    entityId: householdId,
    changes: { deleted: false, reason: "admin-restore" },
  });

  return { ok: true, householdId };
}

export interface DeletedHouseholdRow {
  householdId: string;
  sheetNo: string;
  communityName: string;
  enteredByName: string;
  enteredAt: Date;
  verifiedAt: Date | null;
  deletedAt: Date;
}

export interface DeletedHouseholdListResult {
  allowed: boolean;
  rows: DeletedHouseholdRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** รายการแบบสอบถามที่ถูกลบ (soft) สำหรับหน้า "กู้คืน" — เฉพาะ ADMIN + Audit READ */
export async function listDeletedHouseholds(
  ctx: AuthorizationContext,
  page = 1,
  requestedPageSize = 20,
): Promise<DeletedHouseholdListResult> {
  const safePage = normalizePage(page);
  const pageSize = normalizePageSize(requestedPageSize);
  if (!canManageSheets(ctx)) {
    return { allowed: false, rows: [], total: 0, page: safePage, pageSize };
  }

  const where = { deletedAt: { not: null } };
  const [total, rows] = await Promise.all([
    prisma.household.count({ where }),
    prisma.household.findMany({
      where,
      select: {
        id: true,
        deletedAt: true,
        enteredAt: true,
        verifiedAt: true,
        sheet: { select: { sheetNo: true } },
        community: { select: { nameTh: true } },
        enteredBy: { select: { name: true } },
      },
      orderBy: { deletedAt: "desc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "HouseholdList",
    reason: "deleted-households",
    changes: { count: rows.length },
  });

  return {
    allowed: true,
    total,
    page: safePage,
    pageSize,
    rows: rows.map((r) => ({
      householdId: r.id,
      sheetNo: r.sheet.sheetNo,
      communityName: r.community.nameTh,
      enteredByName: r.enteredBy.name,
      enteredAt: r.enteredAt,
      verifiedAt: r.verifiedAt,
      deletedAt: r.deletedAt as Date,
    })),
  };
}
