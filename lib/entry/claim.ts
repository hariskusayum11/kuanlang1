// Entry Workflow core — testable (ctx-based, ไม่ import next/headers)
// ทุกฟังก์ชันตรวจ permission + community scope จาก ctx ฝั่ง server เท่านั้น
// ห้ามเชื่อ userId/role/scope จาก client — actions.ts เป็นผู้โหลด ctx จาก session จริง

import { BatchStatus, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { isLockExpired, lockExpiryFrom } from "./lock";

/** Batch ที่เปิดให้คีย์ได้ (RECEIVED = ยังไม่ติดเลขใบ → ห้ามคีย์, CLOSED = ปิดแล้ว) */
const CLAIMABLE_BATCH_STATUSES: BatchStatus[] = [
  BatchStatus.READY_FOR_ENTRY,
  BatchStatus.IN_PROGRESS,
];

export type ClaimResult =
  | { ok: true; sheetId: string; resumed: boolean }
  | { ok: false; reason: "FORBIDDEN" | "NO_WORK" };

export type SheetAccess =
  | {
      kind: "OK";
      sheet: {
        id: string;
        sheetNo: string;
        /** null = ใบยังไม่ได้จัดเข้าปึก */
        sequence: number | null;
        status: SheetStatus;
        lockExpiresAt: Date | null;
        batchId: string | null;
        batchCode: string | null;
        communityId: string;
        communityName: string;
      };
    }
  /** ไม่พบ หรืออยู่นอก community scope — ตอบแบบเดียวกันเพื่อกัน IDOR probing */
  | { kind: "NOT_FOUND" }
  | { kind: "NOT_OWNER" }
  | { kind: "LOCK_EXPIRED" }
  /** ใบยังไม่ถูกหยิบ (PENDING) — เสนอให้ claim ก่อนเข้า */
  | { kind: "NOT_LOCKED" }
  /** สถานะอื่น (ENTERED_1 ฯลฯ) — ไม่ใช่งานคีย์ Entry 1 แล้ว */
  | { kind: "WRONG_STATUS"; status: SheetStatus };

// Owner Decision (2026-07-24): การ "คีย์ข้อมูล" ไม่ผูก community scope
//   เจ้าหน้าที่คีย์เปิดใบจากรหัสบนกระดาษที่ถืออยู่ → คีย์ชุมชนไหนก็ได้
//   ยังปลอดภัย: เห็นได้แค่ใบเดียวที่เปิด (ค้น/Export ครัวเรือนทั้งหมดไม่ได้) และ
//   ใบ PENDING ยังไม่มีข้อมูลบุคคล ส่วน "การดูข้อมูลที่คีย์แล้ว" (Verifier/Dashboard)
//   ยังบังคับ community scope เข้มเหมือนเดิม
function canEnter(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.SURVEY_ENTRY);
}

/** ใบที่ผู้ใช้ถือ lock อยู่ (รวมที่หมดอายุแล้ว — เพื่อแสดงสถานะตรงไปตรงมา) */
export async function getMyActiveSheet(ctx: AuthorizationContext) {
  if (!canEnter(ctx)) return null;
  const sheet = await prisma.paperSheet.findFirst({
    where: { lockedById: ctx.userId, status: SheetStatus.LOCKED },
    select: {
      id: true,
      sheetNo: true,
      lockExpiresAt: true,
      batch: { select: { code: true } },
      community: { select: { nameTh: true } },
    },
    orderBy: { lockedAt: "desc" },
  });
  if (!sheet) return null;
  return {
    id: sheet.id,
    sheetNo: sheet.sheetNo,
    lockExpiresAt: sheet.lockExpiresAt,
    batchCode: sheet.batch?.code ?? null,
    communityName: sheet.community.nameTh,
    expired: isLockExpired(sheet.lockExpiresAt, new Date()),
  };
}

/**
 * ใบที่ "คีย์ค้างไว้" ของผู้ใช้ — ยึดจาก **ร่างที่บันทึกไว้** ไม่ใช่จาก lock
 *
 * เหตุผล (บั๊กที่เคยเกิด): เดิมหน้าคีย์ดูจาก lock อย่างเดียว พอผู้คีย์กด
 * "ออกจากแบบฟอร์ม" ระบบจะคืนใบเป็น PENDING และล้าง lock → ใบที่คีย์ค้างหายไป
 * จากหน้าจอทั้งที่ร่างยังอยู่ครบ ผู้คีย์ต้องไปค้นรหัสใบใหม่เองทุกครั้ง
 *
 * เกณฑ์: มี EntryAttempt ที่ยังไม่ส่ง (submittedAt = null) ของผู้ใช้คนนี้
 * และใบยังคีย์ต่อได้ (PENDING หรือ LOCKED โดยตัวเอง — ถ้าคนอื่นถืออยู่จะไม่แสดง)
 */
export async function getMyDraftSheets(ctx: AuthorizationContext, limit = 10) {
  if (!canEnter(ctx)) return [];
  const now = new Date();
  const drafts = await prisma.entryAttempt.findMany({
    where: {
      enteredById: ctx.userId,
      submittedAt: null,
      sheet: {
        OR: [
          { status: SheetStatus.PENDING },
          { status: SheetStatus.LOCKED, lockedById: ctx.userId },
        ],
      },
    },
    select: {
      startedAt: true,
      sheet: {
        select: {
          id: true,
          sheetNo: true,
          status: true,
          lockedById: true,
          lockExpiresAt: true,
          batch: { select: { code: true } },
          community: { select: { nameTh: true } },
        },
      },
    },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  return drafts.map((d) => {
    const heldByMe =
      d.sheet.status === SheetStatus.LOCKED && d.sheet.lockedById === ctx.userId;
    return {
      id: d.sheet.id,
      sheetNo: d.sheet.sheetNo,
      batchCode: d.sheet.batch?.code ?? null,
      communityName: d.sheet.community.nameTh,
      startedAt: d.startedAt,
      /** ต้องกดจองใบก่อนถึงคีย์ต่อได้ (ปล่อยใบไปแล้ว หรือ lock หมดอายุ) */
      needsClaim: !heldByMe || isLockExpired(d.sheet.lockExpiresAt, now),
    };
  });
}

const ENTERED_STATUSES: SheetStatus[] = [
  SheetStatus.ENTERED_1,
  SheetStatus.ENTERED_2,
  SheetStatus.VERIFIED,
];

/**
 * ภาพรวมงานคีย์ใน scope — ตัวเลข aggregate เท่านั้น ไม่มี PII
 * นับด้วย groupBy (ฝั่ง DB) แทนการโหลด sheet ทุกใบเข้ามานับใน JS
 * → คงที่แม้ Batch มีใบหลักหมื่น (scalable)
 */
export async function getEntryOverview(ctx: AuthorizationContext) {
  if (!canEnter(ctx)) return { allowed: false as const, batches: [] };

  // ไม่กรอง community — คีย์ชุมชนไหนก็ได้ (Owner Decision)
  const batches = await prisma.paperBatch.findMany({
    where: { status: { in: CLAIMABLE_BATCH_STATUSES } },
    select: {
      id: true,
      code: true,
      status: true,
      expectedCount: true,
      community: { select: { nameTh: true } },
    },
    orderBy: { code: "asc" },
  });
  if (batches.length === 0) return { allowed: true as const, batches: [] };

  const grouped = await prisma.paperSheet.groupBy({
    by: ["batchId", "status"],
    where: { batchId: { in: batches.map((b) => b.id) } },
    _count: { _all: true },
  });

  // pivot: batchId → { pending, locked, entered, other, total }
  const byBatch = new Map<
    string,
    { pending: number; locked: number; entered: number; other: number; total: number }
  >();
  for (const g of grouped) {
    // where กรอง batchId ไว้แล้ว — เช็คซ้ำเพื่อ narrow type ที่เป็น nullable ตามสคีมา
    if (g.batchId === null) continue;
    const acc =
      byBatch.get(g.batchId) ??
      { pending: 0, locked: 0, entered: 0, other: 0, total: 0 };
    const n = g._count._all;
    acc.total += n;
    if (g.status === SheetStatus.PENDING) acc.pending += n;
    else if (g.status === SheetStatus.LOCKED) acc.locked += n;
    else if (ENTERED_STATUSES.includes(g.status)) acc.entered += n;
    else acc.other += n;
    byBatch.set(g.batchId, acc);
  }

  const now = new Date();
  return {
    allowed: true as const,
    batches: batches.map((b) => {
      const c = byBatch.get(b.id) ?? {
        pending: 0,
        locked: 0,
        entered: 0,
        other: 0,
        total: 0,
      };
      return {
        id: b.id,
        code: b.code,
        status: b.status,
        communityName: b.community.nameTh,
        expectedCount: b.expectedCount,
        totalSheets: c.total,
        pending: c.pending,
        locked: c.locked,
        entered: c.entered,
        other: c.other,
        generatedAt: now,
      };
    }),
  };
}

export type OpenSheetResult =
  | { ok: true; sheetId: string; resumed: boolean }
  /**
   * NOT_FOUND = ไม่มีอยู่ / อยู่นอก community scope / ไม่มีสิทธิ์ — ตอบเหมือนกันหมด (กัน enumeration)
   * IN_USE = ผู้อื่นถือ lock ที่ยังไม่หมดอายุ (หรือแพ้การแข่งขัน)
   * BATCH_NOT_OPEN = ปึกยังไม่เปิดให้คีย์ (RECEIVED) หรือปิดแล้ว (CLOSED)
   * WRONG_STATUS = ใบผ่านขั้นคีย์รอบ 1 ไปแล้ว (ENTERED_1 ฯลฯ)
   */
  | {
      ok: false;
      reason: "NOT_FOUND" | "IN_USE" | "BATCH_NOT_OPEN" | "WRONG_STATUS";
      status?: SheetStatus;
    };

/**
 * เปิดใบตามรหัสบนกระดาษ — Workflow จริง: หัวหน้าแจกปึกกระดาษให้เจ้าหน้าที่
 * เจ้าหน้าที่ถือกระดาษอยู่แล้ว จึงพิมพ์รหัสใบ (sheetNo) หรือลำดับใบในปึกเพื่อเปิดฟอร์ม
 * ระบบไม่ใช่ผู้แจกงาน — lock เป็นเพียงกลไกกันเปิดใบเดียวกันซ้อนกันโดยผิดพลาด
 *
 * @param code  รหัสใบเต็ม (เช่น "SHEET-DEV-TK01-001-024") หรือเลขลำดับในปึก (เมื่อระบุ batchId)
 */
export async function openSheetByCode(
  ctx: AuthorizationContext,
  code: string,
  batchId?: string,
): Promise<OpenSheetResult> {
  if (!canEnter(ctx)) return { ok: false, reason: "NOT_FOUND" };

  const normalized = code.trim().toUpperCase();
  if (!normalized) return { ok: false, reason: "NOT_FOUND" };

  // เลขล้วน + เลือกปึกไว้ → ตีความเป็น "ลำดับใบในปึก" (พิมพ์สั้นกว่ารหัสเต็ม)
  // ไม่ระบุปึก = เปิดด้วยรหัสเต็มเท่านั้น — sequence เดี่ยว ๆ ไม่ระบุใบได้ (#R6-F)
  const selectSheet = {
    id: true,
    status: true,
    lockedById: true,
    lockExpiresAt: true,
    batchId: true,
    batch: { select: { status: true } },
  } as const;
  const sheet =
    batchId && /^\d{1,5}$/.test(normalized)
      ? await prisma.paperSheet.findFirst({
          where: { batchId, sequence: Number(normalized) },
          select: selectSheet,
        })
      : await prisma.paperSheet.findUnique({
          where: { sheetNo: normalized },
          select: selectSheet,
        });
  if (!sheet) return { ok: false, reason: "NOT_FOUND" };

  // ใบที่ยังไม่ได้จัดเข้าปึกไม่มีสถานะปึกให้ตรวจ — เปิดคีย์ได้เลย (Batch เป็นทางเลือก)
  if (sheet.batch && !CLAIMABLE_BATCH_STATUSES.includes(sheet.batch.status)) {
    return { ok: false, reason: "BATCH_NOT_OPEN" };
  }

  const now = new Date();
  if (sheet.status !== SheetStatus.PENDING && sheet.status !== SheetStatus.LOCKED) {
    return { ok: false, reason: "WRONG_STATUS", status: sheet.status };
  }
  const heldByOther =
    sheet.status === SheetStatus.LOCKED &&
    sheet.lockedById !== ctx.userId &&
    !isLockExpired(sheet.lockExpiresAt, now);
  if (heldByOther) return { ok: false, reason: "IN_USE" };

  const resumed =
    sheet.status === SheetStatus.LOCKED &&
    sheet.lockedById === ctx.userId &&
    !isLockExpired(sheet.lockExpiresAt, now);

  // Atomic claim — เงื่อนไขต้องยังจริง ณ เวลาที่เขียน (แพ้การแข่งขัน = count 0)
  const claimed = await prisma.paperSheet.updateMany({
    where: {
      id: sheet.id,
      OR: [
        { status: SheetStatus.PENDING },
        { status: SheetStatus.LOCKED, lockExpiresAt: { lte: now } },
        { status: SheetStatus.LOCKED, lockedById: ctx.userId },
      ],
    },
    data: {
      status: SheetStatus.LOCKED,
      lockedById: ctx.userId,
      lockedAt: now,
      lockExpiresAt: lockExpiryFrom(now),
    },
  });
  if (claimed.count !== 1) return { ok: false, reason: "IN_USE" };

  // ปึกเริ่มมีการคีย์ → IN_PROGRESS (idempotent) · ใบเดี่ยวไม่มีปึกให้ขยับ
  if (sheet.batchId) {
    await prisma.paperBatch.updateMany({
      where: { id: sheet.batchId, status: BatchStatus.READY_FOR_ENTRY },
      data: { status: BatchStatus.IN_PROGRESS },
    });
  }
  return { ok: true, sheetId: sheet.id, resumed };
}

/**
 * เปิดใบที่ระบุด้วย id (ใช้จากหน้า gate / กลับมาคีย์ต่อ)
 * เงื่อนไขเดียวกับ openSheetByCode + ยอมรับใบที่ตนถืออยู่ (ต่ออายุ)
 */
export async function claimSheetById(
  ctx: AuthorizationContext,
  sheetId: string,
): Promise<ClaimResult> {
  if (!canEnter(ctx)) return { ok: false, reason: "FORBIDDEN" };

  const now = new Date();
  const claimed = await prisma.paperSheet.updateMany({
    where: {
      id: sheetId,
      AND: [
        // ใบเดี่ยว (ไม่มีปึก) เปิดได้เสมอ · ใบในปึกต้องอยู่ในปึกที่เปิดให้คีย์
        { OR: [{ batchId: null }, { batch: { status: { in: CLAIMABLE_BATCH_STATUSES } } }] },
        {
          OR: [
            { status: SheetStatus.PENDING },
            { status: SheetStatus.LOCKED, lockExpiresAt: { lte: now } },
            { status: SheetStatus.LOCKED, lockedById: ctx.userId },
          ],
        },
      ],
    },
    data: {
      status: SheetStatus.LOCKED,
      lockedById: ctx.userId,
      lockedAt: now,
      lockExpiresAt: lockExpiryFrom(now),
    },
  });
  if (claimed.count !== 1) return { ok: false, reason: "NO_WORK" };
  return { ok: true, sheetId, resumed: false };
}

/** หยุดคีย์ใบนี้ (ปลด lock กลับเป็น PENDING) — เฉพาะเจ้าของ lock เท่านั้น */
export async function releaseSheet(
  ctx: AuthorizationContext,
  sheetId: string,
): Promise<boolean> {
  if (!canEnter(ctx)) return false;
  const released = await prisma.paperSheet.updateMany({
    where: { id: sheetId, lockedById: ctx.userId, status: SheetStatus.LOCKED },
    data: {
      status: SheetStatus.PENDING,
      lockedById: null,
      lockedAt: null,
      lockExpiresAt: null,
    },
  });
  return released.count === 1;
}

/** ต่ออายุ lock — เฉพาะเจ้าของที่ lock ยังไม่หมดอายุ (หมดอายุแล้วต้อง reclaim) */
export async function renewLock(
  ctx: AuthorizationContext,
  sheetId: string,
): Promise<{ ok: boolean; lockExpiresAt?: Date }> {
  if (!canEnter(ctx)) return { ok: false };
  const now = new Date();
  const expiry = lockExpiryFrom(now);
  const renewed = await prisma.paperSheet.updateMany({
    where: {
      id: sheetId,
      lockedById: ctx.userId,
      status: SheetStatus.LOCKED,
      lockExpiresAt: { gt: now },
    },
    data: { lockExpiresAt: expiry },
  });
  return renewed.count === 1 ? { ok: true, lockExpiresAt: expiry } : { ok: false };
}

/**
 * ตรวจสิทธิ์เข้า Wizard ของใบหนึ่ง — ใช้โดย server page เท่านั้น
 * นอก scope ตอบ NOT_FOUND (ไม่บอกว่ามีใบอยู่จริง — กัน IDOR probing)
 */
export async function getSheetForEntry(
  ctx: AuthorizationContext,
  sheetId: string,
): Promise<SheetAccess> {
  if (!canEnter(ctx)) return { kind: "NOT_FOUND" };

  const sheet = await prisma.paperSheet.findUnique({
    where: { id: sheetId },
    select: {
      id: true,
      sheetNo: true,
      sequence: true,
      status: true,
      lockedById: true,
      lockExpiresAt: true,
      batchId: true,
      communityId: true,
      batch: { select: { code: true } },
      community: { select: { nameTh: true } },
    },
  });
  if (!sheet) return { kind: "NOT_FOUND" };

  if (sheet.status === SheetStatus.PENDING) return { kind: "NOT_LOCKED" };
  if (sheet.status !== SheetStatus.LOCKED)
    return { kind: "WRONG_STATUS", status: sheet.status };
  if (sheet.lockedById !== ctx.userId) return { kind: "NOT_OWNER" };
  if (isLockExpired(sheet.lockExpiresAt, new Date()))
    return { kind: "LOCK_EXPIRED" };

  return {
    kind: "OK",
    sheet: {
      id: sheet.id,
      sheetNo: sheet.sheetNo,
      sequence: sheet.sequence,
      status: sheet.status,
      lockExpiresAt: sheet.lockExpiresAt,
      batchId: sheet.batchId,
      batchCode: sheet.batch?.code ?? null,
      // ชุมชนมาจากใบโดยตรง ไม่ผ่านปึก — ใบที่ไม่มีปึกจึงยังมีชุมชนเสมอ (#R6-F)
      communityId: sheet.communityId,
      communityName: sheet.community.nameTh,
    },
  };
}
