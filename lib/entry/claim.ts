// Entry Workflow core — testable (ctx-based, ไม่ import next/headers)
// ทุกฟังก์ชันตรวจ permission + community scope จาก ctx ฝั่ง server เท่านั้น
// ห้ามเชื่อ userId/role/scope จาก client — actions.ts เป็นผู้โหลด ctx จาก session จริง

import { SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { isLockExpired, lockExpiryFrom } from "./lock";
import { normalizeSheetNo } from "../sheet/number";

/**
 * สถานะที่ผู้คีย์ "เจ้าของใบ" เปิดกลับมาแก้ได้ (Owner Decision 2026-08-03 #R7-C)
 * ผู้คีย์แก้ใบของตนได้ตลอด — ถ้าใบตรวจแล้ว การแก้จะส่งกลับไปรอตรวจใหม่
 */
const REOPENABLE_STATUSES: SheetStatus[] = [
  SheetStatus.ENTERED_1,
  SheetStatus.VERIFIED,
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
        status: SheetStatus;
        lockExpiresAt: Date | null;
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
      community: { select: { nameTh: true } },
    },
    orderBy: { lockedAt: "desc" },
  });
  if (!sheet) return null;
  return {
    id: sheet.id,
    sheetNo: sheet.sheetNo,
    lockExpiresAt: sheet.lockExpiresAt,
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
      communityName: d.sheet.community.nameTh,
      startedAt: d.startedAt,
      /** ต้องกดจองใบก่อนถึงคีย์ต่อได้ (ปล่อยใบไปแล้ว หรือ lock หมดอายุ) */
      needsClaim: !heldByMe || isLockExpired(d.sheet.lockExpiresAt, now),
    };
  });
}

/**
 * ใบที่ผู้ใช้ "คีย์ส่งไปแล้ว" — ผู้คีย์ดูและแก้ของตัวเองได้ตลอด (#R7-C)
 *
 * กรองด้วย `enteredById` ไม่ใช่ community scope — ผู้คีย์จึงเห็นเฉพาะงานของตน
 * แม้ระบบจะยกเลิกการจำกัดขอบเขตชุมชนไปแล้ว (#R7-B)
 */
export async function getMySubmittedSheets(ctx: AuthorizationContext, limit = 50) {
  if (!canEnter(ctx)) return [];
  const rows = await prisma.household.findMany({
    where: { enteredById: ctx.userId, deletedAt: null },
    select: {
      enteredAt: true,
      verifiedAt: true,
      illegibleCount: true,
      blankCount: true,
      sheet: {
        select: {
          id: true,
          sheetNo: true,
          status: true,
          community: { select: { nameTh: true } },
        },
      },
    },
    orderBy: { enteredAt: "desc" },
    take: limit,
  });

  return rows.map((h) => ({
    id: h.sheet.id,
    sheetNo: h.sheet.sheetNo,
    communityName: h.sheet.community.nameTh,
    status: h.sheet.status,
    enteredAt: h.enteredAt,
    verifiedAt: h.verifiedAt,
    illegibleCount: h.illegibleCount,
    blankCount: h.blankCount,
    /** ใบกำลังถูกเปิดแก้อยู่ (โดยตัวเอง) — ยังไม่ได้ส่งกลับ */
    editing: h.sheet.status === SheetStatus.LOCKED,
  }));
}

const ENTERED_STATUSES: SheetStatus[] = [
  SheetStatus.ENTERED_1,
  SheetStatus.ENTERED_2,
  SheetStatus.VERIFIED,
];

/**
 * ภาพรวมงานคีย์รายชุมชน — ตัวเลข aggregate เท่านั้น ไม่มีข้อมูลบุคคล
 *
 * เดิมจัดกลุ่มตามปึก แต่ปึกถูกยกเลิกจากระบบแล้ว (Owner Decision 2026-08-03)
 * จึงจัดกลุ่มตามชุมชนแทน ซึ่งเป็นหน่วยที่ยังมีความหมายกับงานสำรวจจริง
 * นับด้วย groupBy ฝั่งฐานข้อมูล ไม่โหลดใบทั้งหมดเข้ามานับใน JS
 */
export async function getEntryOverview(ctx: AuthorizationContext) {
  if (!canEnter(ctx)) return { allowed: false as const, communities: [] };

  // ไม่กรอง community — คีย์ชุมชนไหนก็ได้ตามกระดาษที่ถืออยู่ (Owner Decision)
  const communities = await prisma.community.findMany({
    where: { deletedAt: null, isActive: true },
    select: { id: true, nameTh: true },
    orderBy: { nameTh: "asc" },
  });
  if (communities.length === 0) return { allowed: true as const, communities: [] };

  const grouped = await prisma.paperSheet.groupBy({
    by: ["communityId", "status"],
    _count: { _all: true },
  });

  const byCommunity = new Map<
    string,
    { pending: number; locked: number; entered: number; other: number; total: number }
  >();
  for (const g of grouped) {
    const acc =
      byCommunity.get(g.communityId) ??
      { pending: 0, locked: 0, entered: 0, other: 0, total: 0 };
    const n = g._count._all;
    acc.total += n;
    if (g.status === SheetStatus.PENDING) acc.pending += n;
    else if (g.status === SheetStatus.LOCKED) acc.locked += n;
    else if (ENTERED_STATUSES.includes(g.status)) acc.entered += n;
    else acc.other += n;
    byCommunity.set(g.communityId, acc);
  }

  const now = new Date();
  return {
    allowed: true as const,
    communities: communities.map((c) => {
      const n = byCommunity.get(c.id) ?? {
        pending: 0,
        locked: 0,
        entered: 0,
        other: 0,
        total: 0,
      };
      return {
        id: c.id,
        communityName: c.nameTh,
        totalSheets: n.total,
        pending: n.pending,
        locked: n.locked,
        entered: n.entered,
        other: n.other,
        generatedAt: now,
      };
    }),
  };
}

export type OpenSheetResult =
  | { ok: true; sheetId: string; resumed: boolean }
  /**
   * NOT_FOUND = ไม่มีอยู่ / รูปแบบรหัสไม่ถูกต้อง / ไม่มีสิทธิ์ — ตอบเหมือนกันหมด (กัน enumeration)
   * IN_USE = ผู้อื่นถือ lock ที่ยังไม่หมดอายุ (หรือแพ้การแข่งขัน)
   * WRONG_STATUS = ใบผ่านขั้นคีย์รอบ 1 ไปแล้ว (ENTERED_1 ฯลฯ)
   */
  | {
      ok: false;
      reason: "NOT_FOUND" | "IN_USE" | "WRONG_STATUS";
      status?: SheetStatus;
    };

/**
 * เปิดใบที่มีอยู่แล้วจากรหัสบนกระดาษ — ใช้เมื่อผู้คีย์กลับมาคีย์ใบเดิมต่อ
 *
 * ใบใหม่ไม่ผ่านทางนี้ — ระบบออกรหัสให้ตอนกด "เริ่มกรอก" (ดู lib/sheet/create.ts)
 * ทางนี้จึงเหลือไว้สำหรับกรณีถือกระดาษที่มีรหัสเขียนไว้แล้วกลับมาทำต่อ
 *
 * @param code รหัสใบ เช่น "SK-000123" · รับ "123" หรือ "sk000123" ได้ (normalize ให้)
 */
export async function openSheetByCode(
  ctx: AuthorizationContext,
  code: string,
): Promise<OpenSheetResult> {
  if (!canEnter(ctx)) return { ok: false, reason: "NOT_FOUND" };

  const sheetNo = normalizeSheetNo(code);
  if (!sheetNo) return { ok: false, reason: "NOT_FOUND" };

  const sheet = await prisma.paperSheet.findUnique({
    where: { sheetNo },
    select: {
      id: true,
      status: true,
      lockedById: true,
      lockExpiresAt: true,
      household: { select: { enteredById: true } },
    },
  });
  if (!sheet) return { ok: false, reason: "NOT_FOUND" };

  const now = new Date();
  // ใบที่ตนคีย์ส่งไปแล้ว เปิดกลับมาแก้ได้ตลอด (#R7-C) — ของคนอื่นยังปิดตามเดิม
  const mineReopenable =
    REOPENABLE_STATUSES.includes(sheet.status) &&
    sheet.household?.enteredById === ctx.userId;
  if (
    sheet.status !== SheetStatus.PENDING &&
    sheet.status !== SheetStatus.LOCKED &&
    !mineReopenable
  ) {
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
        { status: { in: REOPENABLE_STATUSES }, household: { enteredById: ctx.userId } },
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
  return { ok: true, sheetId: sheet.id, resumed };
}

/** จองใบจาก id ภายในระบบ — ใช้ตอนกลับมาคีย์ใบที่ค้างไว้จากหน้ารายการ */
export async function claimSheetById(
  ctx: AuthorizationContext,
  sheetId: string,
): Promise<ClaimResult> {
  if (!canEnter(ctx)) return { ok: false, reason: "FORBIDDEN" };

  const now = new Date();
  const claimed = await prisma.paperSheet.updateMany({
    where: {
      id: sheetId,
      OR: [
        { status: SheetStatus.PENDING },
        { status: SheetStatus.LOCKED, lockExpiresAt: { lte: now } },
        { status: SheetStatus.LOCKED, lockedById: ctx.userId },
        // ใบที่ตนคีย์ส่งไปแล้ว — เปิดกลับมาแก้ได้ตลอด (Owner Decision #R7-C)
        { status: { in: REOPENABLE_STATUSES }, household: { enteredById: ctx.userId } },
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

/**
 * หยุดคีย์ใบนี้ (ปลด lock) — เฉพาะเจ้าของ lock เท่านั้น
 *
 * ต้องคืนสถานะ "ตามที่เคยเป็น" ไม่ใช่ PENDING เสมอ — ใบที่ส่งแล้วถูกเปิดกลับมาแก้
 * ถ้าปล่อยกลับเป็น PENDING จะทำให้ใบที่คีย์เสร็จ/ตรวจแล้ว กลายเป็นใบว่างและข้อมูลหาย
 * จากคิวตรวจทันที (บั๊กที่ทำให้ตัวเลข "ตรวจแล้ว" เพี้ยนโดยไม่มีใครรู้)
 */
export async function releaseSheet(
  ctx: AuthorizationContext,
  sheetId: string,
): Promise<boolean> {
  if (!canEnter(ctx)) return false;
  const sheet = await prisma.paperSheet.findUnique({
    where: { id: sheetId },
    select: { household: { select: { verifiedAt: true } } },
  });
  if (!sheet) return false;
  const restored = !sheet.household
    ? SheetStatus.PENDING
    : sheet.household.verifiedAt
      ? SheetStatus.VERIFIED
      : SheetStatus.ENTERED_1;

  const released = await prisma.paperSheet.updateMany({
    where: { id: sheetId, lockedById: ctx.userId, status: SheetStatus.LOCKED },
    data: {
      status: restored,
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
      status: true,
      lockedById: true,
      lockExpiresAt: true,
      communityId: true,
      community: { select: { nameTh: true } },
      household: { select: { enteredById: true } },
    },
  });
  if (!sheet) return { kind: "NOT_FOUND" };

  if (sheet.status === SheetStatus.PENDING) return { kind: "NOT_LOCKED" };
  if (sheet.status !== SheetStatus.LOCKED) {
    // ใบที่ตนคีย์ส่งไปแล้ว → เสนอให้กดเปิดแก้ (ผ่านด่าน claim เดิม) ไม่ใช่ปิดตาย
    const mine =
      REOPENABLE_STATUSES.includes(sheet.status) &&
      sheet.household?.enteredById === ctx.userId;
    return mine
      ? { kind: "NOT_LOCKED" }
      : { kind: "WRONG_STATUS", status: sheet.status };
  }
  if (sheet.lockedById !== ctx.userId) return { kind: "NOT_OWNER" };
  if (isLockExpired(sheet.lockExpiresAt, new Date()))
    return { kind: "LOCK_EXPIRED" };

  return {
    kind: "OK",
    sheet: {
      id: sheet.id,
      sheetNo: sheet.sheetNo,
      status: sheet.status,
      lockExpiresAt: sheet.lockExpiresAt,
      communityId: sheet.communityId,
      communityName: sheet.community.nameTh,
    },
  };
}
