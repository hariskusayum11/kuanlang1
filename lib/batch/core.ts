// Core logic — Batch Management: รับปึกกระดาษเข้าระบบ → เปิดให้คีย์ → ปิดปึก
// แยกจาก UI/actions เพื่อ integration test ตรงได้ (pattern เดียวกับ lib/entry/claim.ts)

import { AuditAction, BatchStatus, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { canAccessCommunity, hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { normalizeSheetNo, parseSheetNumbers, parseErrorMessage } from "./sheet-numbers";

// ---------------------------------------------------------------------------
// รับปึก (สร้าง Batch + Sheet ทั้งหมดใน transaction เดียว)
// ---------------------------------------------------------------------------

export type BatchNumbering =
  | { mode: "PRINTED"; numbersText: string } // กระดาษมีเลขพิมพ์/เขียนมาแล้ว
  | { mode: "AUTO"; count: number }; // ระบบรันเลขให้ (SHEET-<ชุมชน>-<ปึก>-<ลำดับ>)

export interface CreateBatchInput {
  communityId: string;
  handedOverBy?: string;
  storageLocation?: string;
  note?: string;
  numbering: BatchNumbering;
}

export type CreateBatchResult =
  | { ok: true; batchId: string; code: string; sheetCount: number }
  | {
      ok: false;
      reason:
        | "FORBIDDEN"
        | "INVALID_COMMUNITY"
        | "PARSE_ERROR"
        | "SHEET_CONFLICT"
        | "ERROR";
      message?: string;
      /** เลขที่ชนกับใบที่มีอยู่แล้วในระบบ (ปึกอื่น) */
      conflicts?: string[];
    };

export async function createBatch(
  ctx: AuthorizationContext,
  input: CreateBatchInput,
): Promise<CreateBatchResult> {
  if (
    !hasPermission(ctx, PERMISSIONS.BATCH_MANAGE) ||
    !canAccessCommunity(ctx, input.communityId)
  ) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  const community = await prisma.community.findFirst({
    where: { id: input.communityId, deletedAt: null, isActive: true },
    select: { id: true, code: true },
  });
  if (!community) return { ok: false, reason: "INVALID_COMMUNITY" };

  // --- เตรียมรายการเลขใบตามโหมด ---
  let printedNumbers: string[] | null = null;
  let sheetCount: number;
  if (input.numbering.mode === "PRINTED") {
    const parsed = parseSheetNumbers(input.numbering.numbersText);
    if (!parsed.ok) {
      return { ok: false, reason: "PARSE_ERROR", message: parseErrorMessage(parsed) };
    }
    printedNumbers = parsed.numbers;
    sheetCount = parsed.numbers.length;
  } else {
    sheetCount = input.numbering.count;
  }

  // --- เช็คเลขชนกับใบที่มีอยู่ (โหมด PRINTED) ก่อนสร้าง — ให้ error ชี้เลขได้ ---
  if (printedNumbers) {
    const existing = await prisma.paperSheet.findMany({
      where: { sheetNo: { in: printedNumbers } },
      select: { sheetNo: true },
      take: 20,
    });
    if (existing.length > 0) {
      return {
        ok: false,
        reason: "SHEET_CONFLICT",
        conflicts: existing.map((s) => s.sheetNo),
      };
    }
  }

  // --- สร้าง Batch + Sheets (retry เมื่อรหัสปึกชนจากการสร้างพร้อมกัน) ---
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const running = (await prisma.paperBatch.count({
      where: { communityId: community.id },
    })) + 1 + attempt;
    const code = `BATCH-${community.code}-${String(running).padStart(3, "0")}`;

    try {
      const batch = await prisma.$transaction(async (tx) => {
        const created = await tx.paperBatch.create({
          data: {
            code,
            communityId: community.id,
            expectedCount: sheetCount,
            receivedCount: sheetCount,
            handedOverBy: input.handedOverBy ?? null,
            storageLocation: input.storageLocation ?? null,
            note: input.note ?? null,
            receivedAt: new Date(),
            receivedById: ctx.userId,
            status: BatchStatus.RECEIVED,
          },
        });
        const numbers =
          printedNumbers ??
          Array.from({ length: sheetCount }, (_, i) =>
            `${code.replace(/^BATCH-/, "SHEET-")}-${String(i + 1).padStart(3, "0")}`,
          );
        await tx.paperSheet.createMany({
          data: numbers.map((sheetNo, i) => ({
            communityId: community.id,
            batchId: created.id,
            sheetNo,
            sequence: i + 1,
          })),
        });
        return created;
      });

      await writeAuditLog({
        userId: ctx.userId,
        action: AuditAction.CREATE,
        entityType: "PaperBatch",
        entityId: batch.id,
      });
      return { ok: true, batchId: batch.id, code, sheetCount };
    } catch (e) {
      // Unique conflict: รหัสปึกชน (สร้างพร้อมกัน) → ลองรหัสถัดไป
      // หรือเลขใบชน (แข่งกับปึกอื่นที่เพิ่งสร้าง) → รายงานเลขชน
      const isUnique =
        typeof e === "object" && e !== null && "code" in e && e.code === "P2002";
      if (!isUnique) return { ok: false, reason: "ERROR" };
      if (printedNumbers) {
        const conflicts = await prisma.paperSheet.findMany({
          where: { sheetNo: { in: printedNumbers } },
          select: { sheetNo: true },
          take: 20,
        });
        if (conflicts.length > 0) {
          return {
            ok: false,
            reason: "SHEET_CONFLICT",
            conflicts: conflicts.map((s) => s.sheetNo),
          };
        }
      }
      // ไม่ใช่เลขใบชน → เป็นรหัสปึกชน วนลองใหม่
    }
  }
  return { ok: false, reason: "ERROR" };
}

// ---------------------------------------------------------------------------
// ลงทะเบียนแบบสอบถามทีละใบ (ปึกเป็นทางเลือก — Owner Decision 2026-08-01 #R6-F)
// ---------------------------------------------------------------------------

/**
 * คอลัมน์ที่ทำให้ unique constraint ชน (P2002) — `null` เมื่อไม่ใช่ P2002
 *
 * Prisma คืน `meta.target` เป็นรายชื่อ **คอลัมน์** ทั้งกรณี unique ในสคีมา
 * (`["sheetNo"]`) และ partial unique ที่สร้างด้วย raw SQL (`["batchId","sequence"]`)
 * — ตรวจกับฐานข้อมูลจริงแล้ว ไม่ใช่การอนุมาน · เผื่อ string เดี่ยวไว้กันรูปแบบต่างเวอร์ชัน
 */
function uniqueConflictTarget(e: unknown): string[] | null {
  if (typeof e !== "object" || e === null) return null;
  if (!("code" in e) || e.code !== "P2002") return null;
  const target = (e as { meta?: { target?: unknown } }).meta?.target;
  if (typeof target === "string") return [target];
  if (Array.isArray(target)) return target.filter((t): t is string => typeof t === "string");
  return [];
}

export interface RegisterSheetInput {
  sheetNo: string;
  communityId: string;
  /** ระบุเฉพาะเมื่อกระดาษถูกจัดเป็นปึกจริง — ไม่ระบุ = ใบเดี่ยว (batchId/sequence = null) */
  batchId?: string | null;
}

export type RegisterSheetResult =
  | {
      ok: true;
      sheetId: string;
      sheetNo: string;
      communityName: string;
      batchCode: string | null;
      sequence: number | null;
    }
  | {
      ok: false;
      reason:
        | "FORBIDDEN"
        | "INVALID_SHEET_NO"
        | "INVALID_COMMUNITY"
        | "BATCH_NOT_FOUND"
        | "BATCH_CLOSED"
        | "COMMUNITY_MISMATCH"
        | "SHEET_CONFLICT"
        | "ERROR";
    };

/**
 * ผู้รับเอกสาร (`batch.manage`) ลงทะเบียนใบกระดาษเข้าระบบ
 *
 * เป็น "ด่านยืนยันว่ากระดาษมีอยู่จริงและอยู่ชุมชนใด" — จึงเป็นหน้าที่ของผู้รับเอกสาร
 * ไม่ใช่ผู้คีย์ (`survey.entry` ไม่ผูก community scope จึงสร้างใบเองไม่ได้)
 */
export async function registerSheet(
  ctx: AuthorizationContext,
  input: RegisterSheetInput,
): Promise<RegisterSheetResult> {
  if (!hasPermission(ctx, PERMISSIONS.BATCH_MANAGE)) {
    return { ok: false, reason: "FORBIDDEN" };
  }

  const sheetNo = normalizeSheetNo(input.sheetNo);
  if (!sheetNo) return { ok: false, reason: "INVALID_SHEET_NO" };

  // ปึกเป็นตัวตัดสินชุมชน — ค่าจาก client ที่ขัดกับปึกต้องถูกปฏิเสธ ไม่ใช่เขียนทับเงียบ ๆ
  let batch: { id: string; code: string; communityId: string; status: BatchStatus } | null =
    null;
  if (input.batchId) {
    batch = await prisma.paperBatch.findUnique({
      where: { id: input.batchId },
      select: { id: true, code: true, communityId: true, status: true },
    });
    if (!batch) return { ok: false, reason: "BATCH_NOT_FOUND" };
    if (batch.status === BatchStatus.CLOSED) return { ok: false, reason: "BATCH_CLOSED" };
    if (batch.communityId !== input.communityId) {
      return { ok: false, reason: "COMMUNITY_MISMATCH" };
    }
  }

  const communityId = batch?.communityId ?? input.communityId;
  if (!canAccessCommunity(ctx, communityId)) return { ok: false, reason: "FORBIDDEN" };

  const community = await prisma.community.findFirst({
    where: { id: communityId, deletedAt: null, isActive: true },
    select: { id: true, nameTh: true },
  });
  if (!community) return { ok: false, reason: "INVALID_COMMUNITY" };

  // ลองซ้ำได้เฉพาะกรณีชน (batchId, sequence) จากผู้ใช้สองคนลงทะเบียนปึกเดียวกันพร้อมกัน
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const sheet = await prisma.$transaction(async (tx) => {
        let sequence: number | null = null;
        if (batch) {
          // จัดคิวการหาลำดับถัดไปให้เป็นทีละคนต่อปึก — พิสูจน์แล้วว่า retry อย่างเดียวไม่พอ
          // (ลงทะเบียนพร้อมกัน 4 ใบในปึกเดียว ต้องใช้ retry ~N รอบ จึงมีใบตกหล่นจริง)
          // ล็อกผูกกับทรานแซกชัน ปลดเองเมื่อจบ · แคบระดับปึก ไม่กระทบปึกอื่นหรือใบนอกปึก
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${batch.id})::bigint)`;
          const last = await tx.paperSheet.findFirst({
            where: { batchId: batch.id },
            orderBy: { sequence: "desc" },
            select: { sequence: true },
          });
          sequence = (last?.sequence ?? 0) + 1;
        }
        const created = await tx.paperSheet.create({
          data: {
            communityId: community.id,
            batchId: batch?.id ?? null,
            sequence,
            sheetNo,
            status: SheetStatus.PENDING,
          },
          select: { id: true, sequence: true },
        });
        if (batch) {
          // ปึกมีกระดาษเพิ่มจริงหนึ่งใบ — ตัวนับที่แสดงบนหน้าปึกต้องตรงกับจำนวนใบ
          await tx.paperBatch.update({
            where: { id: batch.id },
            data: {
              expectedCount: { increment: 1 },
              receivedCount: { increment: 1 },
            },
          });
        }
        return created;
      });

      await writeAuditLog({
        userId: ctx.userId,
        action: AuditAction.CREATE,
        entityType: "PaperSheet",
        entityId: sheet.id,
      });
      return {
        ok: true,
        sheetId: sheet.id,
        sheetNo,
        communityName: community.nameTh,
        batchCode: batch?.code ?? null,
        sequence: sheet.sequence,
      };
    } catch (e) {
      const target = uniqueConflictTarget(e);
      if (!target) return { ok: false, reason: "ERROR" };

      // เลขใบซ้ำ = ผู้ใช้ต้องแก้เอง retry ไม่ช่วย
      if (target.includes("sheetNo")) return { ok: false, reason: "SHEET_CONFLICT" };
      // ชน (batchId, sequence) = อีกคนแทรกลำดับเดียวกันระหว่างอ่าน max → อ่านใหม่แล้วลองอีก
      if (target.includes("sequence")) continue;

      // ไม่รู้ว่าคอนสเตรนต์ใด — ตรวจให้แน่ว่าเลขใบถูกใช้ไปแล้วหรือไม่ ก่อนตัดสิน
      const taken = await prisma.paperSheet.count({ where: { sheetNo } });
      if (taken > 0) return { ok: false, reason: "SHEET_CONFLICT" };
      return { ok: false, reason: "ERROR" };
    }
  }
  // ชนลำดับติดกันครบ 3 รอบ — ปึกกำลังถูกแก้พร้อมกันหนัก ให้ผู้ใช้ลองใหม่
  return { ok: false, reason: "ERROR" };
}

// ---------------------------------------------------------------------------
// รายการปึก + รายละเอียด (scope-filtered)
// ---------------------------------------------------------------------------

export interface BatchListRow {
  id: string;
  code: string;
  communityId: string;
  communityName: string;
  status: BatchStatus;
  expectedCount: number;
  totalSheets: number;
  awaiting: number; // PENDING + LOCKED
  entered: number; // ENTERED_* / DISCREPANCY / NEEDS_FIELD_QUERY
  verified: number;
  problem: number; // SHEET_LOST / UNRESOLVABLE / MERGED_INTO
  receivedAt: Date;
  storageLocation: string | null;
}

const AWAITING_STATUSES: SheetStatus[] = [SheetStatus.PENDING, SheetStatus.LOCKED];
const ENTERED_STATUSES: SheetStatus[] = [
  SheetStatus.ENTERED_1,
  SheetStatus.ENTERED_2,
  SheetStatus.DISCREPANCY,
  SheetStatus.NEEDS_FIELD_QUERY,
];
const PROBLEM_STATUSES: SheetStatus[] = [
  SheetStatus.SHEET_LOST,
  SheetStatus.UNRESOLVABLE,
  SheetStatus.MERGED_INTO,
];

function scopeWhere(ctx: AuthorizationContext) {
  return ctx.isGlobalScope ? {} : { communityId: { in: ctx.communityIds } };
}

export async function listBatches(
  ctx: AuthorizationContext,
): Promise<BatchListRow[] | null> {
  if (!hasPermission(ctx, PERMISSIONS.BATCH_MANAGE)) return null;

  const batches = await prisma.paperBatch.findMany({
    where: scopeWhere(ctx),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      communityId: true,
      status: true,
      expectedCount: true,
      receivedAt: true,
      storageLocation: true,
      community: { select: { nameTh: true } },
    },
    take: 100,
  });
  if (batches.length === 0) return [];

  const grouped = await prisma.paperSheet.groupBy({
    by: ["batchId", "status"],
    where: { batchId: { in: batches.map((b) => b.id) } },
    _count: { _all: true },
  });
  const countOf = (batchId: string, statuses: SheetStatus[]) =>
    grouped
      .filter((g) => g.batchId === batchId && statuses.includes(g.status))
      .reduce((sum, g) => sum + g._count._all, 0);

  return batches.map((b) => ({
    id: b.id,
    code: b.code,
    communityId: b.communityId,
    communityName: b.community.nameTh,
    status: b.status,
    expectedCount: b.expectedCount,
    totalSheets: grouped
      .filter((g) => g.batchId === b.id)
      .reduce((sum, g) => sum + g._count._all, 0),
    awaiting: countOf(b.id, AWAITING_STATUSES),
    entered: countOf(b.id, ENTERED_STATUSES),
    verified: countOf(b.id, [SheetStatus.VERIFIED]),
    problem: countOf(b.id, PROBLEM_STATUSES),
    receivedAt: b.receivedAt,
    storageLocation: b.storageLocation,
  }));
}

export interface BatchDetail {
  id: string;
  code: string;
  communityName: string;
  status: BatchStatus;
  expectedCount: number;
  totalSheets: number;
  awaiting: number;
  entered: number;
  verified: number;
  problem: number;
  receivedAt: Date;
  handedOverBy: string | null;
  storageLocation: string | null;
  note: string | null;
  receivedByName: string;
  /** เลขใบที่ยังไม่ถูกคีย์ (รอคีย์/ถูก lock อยู่) — ใช้ไล่หาใบค้าง/ใบหาย */
  awaitingNumbers: string[];
}

export async function getBatchDetail(
  ctx: AuthorizationContext,
  batchId: string,
): Promise<BatchDetail | null> {
  if (!hasPermission(ctx, PERMISSIONS.BATCH_MANAGE)) return null;

  const batch = await prisma.paperBatch.findFirst({
    // scope ใน where เลย — นอก scope = ไม่พบ (ไม่เผยว่ามีอยู่)
    where: { id: batchId, ...scopeWhere(ctx) },
    select: {
      id: true,
      code: true,
      status: true,
      expectedCount: true,
      receivedAt: true,
      handedOverBy: true,
      storageLocation: true,
      note: true,
      community: { select: { nameTh: true } },
      receivedBy: { select: { name: true } },
    },
  });
  if (!batch) return null;

  const [grouped, awaitingSheets] = await Promise.all([
    prisma.paperSheet.groupBy({
      by: ["status"],
      where: { batchId },
      _count: { _all: true },
    }),
    prisma.paperSheet.findMany({
      where: { batchId, status: { in: AWAITING_STATUSES } },
      orderBy: { sequence: "asc" },
      select: { sheetNo: true },
    }),
  ]);
  const countOf = (statuses: SheetStatus[]) =>
    grouped
      .filter((g) => statuses.includes(g.status))
      .reduce((sum, g) => sum + g._count._all, 0);

  return {
    id: batch.id,
    code: batch.code,
    communityName: batch.community.nameTh,
    status: batch.status,
    expectedCount: batch.expectedCount,
    totalSheets: grouped.reduce((sum, g) => sum + g._count._all, 0),
    awaiting: countOf(AWAITING_STATUSES),
    entered: countOf(ENTERED_STATUSES),
    verified: countOf([SheetStatus.VERIFIED]),
    problem: countOf(PROBLEM_STATUSES),
    receivedAt: batch.receivedAt,
    handedOverBy: batch.handedOverBy,
    storageLocation: batch.storageLocation,
    note: batch.note,
    receivedByName: batch.receivedBy.name,
    awaitingNumbers: awaitingSheets.map((s) => s.sheetNo),
  };
}

// ---------------------------------------------------------------------------
// เปลี่ยนสถานะปึก (race-safe ด้วย updateMany แบบมีเงื่อนไข)
// ---------------------------------------------------------------------------

export type BatchTransitionResult =
  | { ok: true }
  | { ok: false; reason: "FORBIDDEN" | "NOT_FOUND" | "WRONG_STATUS" | "HAS_UNFINISHED" };

/** เปิดปึกให้คีย์ — RECEIVED → READY_FOR_ENTRY */
export async function openBatchForEntry(
  ctx: AuthorizationContext,
  batchId: string,
): Promise<BatchTransitionResult> {
  if (!hasPermission(ctx, PERMISSIONS.BATCH_MANAGE)) {
    return { ok: false, reason: "FORBIDDEN" };
  }
  const batch = await prisma.paperBatch.findFirst({
    where: { id: batchId, ...scopeWhere(ctx) },
    select: { id: true, status: true },
  });
  if (!batch) return { ok: false, reason: "NOT_FOUND" };

  const updated = await prisma.paperBatch.updateMany({
    where: { id: batchId, status: BatchStatus.RECEIVED },
    data: { status: BatchStatus.READY_FOR_ENTRY },
  });
  if (updated.count !== 1) return { ok: false, reason: "WRONG_STATUS" };

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "PaperBatch",
    entityId: batchId,
    changes: { status: { old: "RECEIVED", new: "READY_FOR_ENTRY" } },
  });
  return { ok: true };
}

/**
 * ปิดปึก — ได้ต่อเมื่อไม่มีใบค้างงาน (ทุกใบต้อง VERIFIED / SHEET_LOST /
 * UNRESOLVABLE / MERGED_INTO) — ตรวจ + ปิดใน transaction เดียวกันสถานะไม่วิ่งหนี
 */
export async function closeBatch(
  ctx: AuthorizationContext,
  batchId: string,
): Promise<BatchTransitionResult> {
  if (!hasPermission(ctx, PERMISSIONS.BATCH_MANAGE)) {
    return { ok: false, reason: "FORBIDDEN" };
  }
  const batch = await prisma.paperBatch.findFirst({
    where: { id: batchId, ...scopeWhere(ctx) },
    select: { id: true, status: true },
  });
  if (!batch) return { ok: false, reason: "NOT_FOUND" };
  if (batch.status === BatchStatus.CLOSED) {
    return { ok: false, reason: "WRONG_STATUS" };
  }

  const result = await prisma.$transaction(async (tx) => {
    const unfinished = await tx.paperSheet.count({
      where: {
        batchId,
        status: { notIn: [SheetStatus.VERIFIED, ...PROBLEM_STATUSES] },
      },
    });
    if (unfinished > 0) return "HAS_UNFINISHED" as const;

    const updated = await tx.paperBatch.updateMany({
      where: { id: batchId, status: { not: BatchStatus.CLOSED } },
      data: {
        status: BatchStatus.CLOSED,
        closedAt: new Date(),
        closedById: ctx.userId,
      },
    });
    return updated.count === 1 ? ("OK" as const) : ("WRONG_STATUS" as const);
  });

  if (result !== "OK") return { ok: false, reason: result };

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "PaperBatch",
    entityId: batchId,
    changes: { status: { old: batch.status, new: "CLOSED" } },
  });
  return { ok: true };
}

/** ชุมชนที่ผู้ใช้รับปึกได้ (ตาม scope) — สำหรับ dropdown ฟอร์มรับปึก */
export async function listReceivableCommunities(
  ctx: AuthorizationContext,
): Promise<{ id: string; nameTh: string }[]> {
  if (!hasPermission(ctx, PERMISSIONS.BATCH_MANAGE)) return [];
  return prisma.community.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(ctx.isGlobalScope ? {} : { id: { in: ctx.communityIds } }),
    },
    orderBy: { nameTh: "asc" },
    select: { id: true, nameTh: true },
  });
}
