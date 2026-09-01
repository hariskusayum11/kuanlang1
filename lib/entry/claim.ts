// Entry Workflow core — testable (ctx-based, ไม่ import next/headers)
// ทุกฟังก์ชันตรวจ permission + community scope จาก ctx ฝั่ง server เท่านั้น
// ห้ามเชื่อ userId/role/scope จาก client — actions.ts เป็นผู้โหลด ctx จาก session จริง

import { AuditAction, Prisma, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
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
  /** ใบยังไม่ถูกหยิบ — เสนอให้ claim ก่อนเข้า
   *  reopen=true → เป็นใบที่ตนคีย์ส่งไปแล้วและกำลังกดกลับมาแก้ (ไม่ใช่ใบว่าง PENDING)
   *  ใช้เลือกถ้อยคำบนหน้า Gate ให้ตรง ("แก้ไข" ไม่ใช่ "เริ่มคีย์") */
  | { kind: "NOT_LOCKED"; reopen?: boolean }
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
 * เกณฑ์ (ยึดจาก "ใบที่ยังไม่ส่ง" ไม่ใช่แค่ร่างที่บันทึกแล้ว):
 *  1) ใบที่ผู้ใช้ถือ lock อยู่เองและยังไม่มี Household — รวมใบที่ "เพิ่งออกรหัสแต่ยัง
 *     ไม่ได้กรอกอะไร" ด้วย (startSheet ไม่สร้าง EntryAttempt จึงต้องดูจาก lock)
 *  2) ใบที่เคยบันทึกร่างไว้แล้วปล่อยใบไป (กลับเป็น PENDING) — ยังคีย์ต่อได้
 * ตัดใบที่มี Household แล้วออก เพราะนั่นคือใบที่ส่งแล้ว (อยู่ในรายการ "ที่ฉันคีย์")
 */
export async function getMyDraftSheets(ctx: AuthorizationContext, limit = 10) {
  if (!canEnter(ctx)) return [];
  const now = new Date();
  const sheets = await prisma.paperSheet.findMany({
    where: {
      OR: [
        {
          status: SheetStatus.LOCKED,
          lockedById: ctx.userId,
          household: { is: null },
        },
        {
          status: SheetStatus.PENDING,
          entryAttempts: { some: { enteredById: ctx.userId, submittedAt: null } },
        },
      ],
    },
    select: {
      id: true,
      sheetNo: true,
      status: true,
      lockedById: true,
      lockedAt: true,
      lockExpiresAt: true,
      createdAt: true,
      community: { select: { nameTh: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return sheets.map((s) => {
    const heldByMe =
      s.status === SheetStatus.LOCKED && s.lockedById === ctx.userId;
    return {
      id: s.id,
      sheetNo: s.sheetNo,
      communityName: s.community.nameTh,
      startedAt: s.lockedAt ?? s.createdAt,
      /** ต้องกดจองใบก่อนถึงคีย์ต่อได้ (ปล่อยใบไปแล้ว หรือ lock หมดอายุ) */
      needsClaim: !heldByMe || isLockExpired(s.lockExpiresAt, now),
    };
  });
}

/**
 * ใบที่ผู้ใช้ "คีย์ส่งไปแล้ว" — ผู้คีย์ดูและแก้ของตัวเองได้ตลอด (#R7-C)
 *
 * กรองด้วย `enteredById` ไม่ใช่ community scope — ผู้คีย์จึงเห็นเฉพาะงานของตน
 * แม้ระบบจะยกเลิกการจำกัดขอบเขตชุมชนไปแล้ว (#R7-B)
 */
export type MySubmittedStatusFilter = "ALL" | "VERIFIED" | "PENDING" | "EDITING";

export interface MySubmittedFilters {
  query?: string;
  communityId?: string;
  status?: MySubmittedStatusFilter;
  dateFrom?: string;
  dateTo?: string;
}

function submittedDate(value?: string, endOfRange = false): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.valueOf())) return undefined;
  if (endOfRange) date.setDate(date.getDate() + 1);
  return date;
}

/** เงื่อนไขเดียวสำหรับทั้งรายการและยอดรวม ป้องกันเลขแบ่งหน้าไม่ตรงกับผลค้นหา */
export function buildMySubmittedWhere(
  userId: string,
  filters: MySubmittedFilters = {},
): Prisma.HouseholdWhereInput {
  const query = filters.query?.trim().slice(0, 80) ?? "";
  const from = submittedDate(filters.dateFrom);
  const to = submittedDate(filters.dateTo, true);
  const status = filters.status ?? "ALL";
  const statusWhere: Prisma.PaperSheetWhereInput = status === "VERIFIED"
    ? { status: SheetStatus.VERIFIED }
    : status === "EDITING"
      ? { status: SheetStatus.LOCKED }
      : status === "PENDING"
        ? { status: { notIn: [SheetStatus.VERIFIED, SheetStatus.LOCKED] } }
        : {};

  return {
    enteredById: userId,
    deletedAt: null,
    ...(filters.communityId ? { communityId: filters.communityId } : {}),
    ...(from || to ? { enteredAt: {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: to } : {}),
    } } : {}),
    sheet: {
      ...statusWhere,
    },
    ...(query ? { OR: [
      { houseNo: { contains: query, mode: "insensitive" } },
      { sheet: { sheetNo: { contains: query, mode: "insensitive" } } },
    ] } : {}),
  };
}

export async function getMySubmittedSheets(
  ctx: AuthorizationContext,
  limit = 50,
  offset = 0,
  filters: MySubmittedFilters = {},
) {
  if (!canEnter(ctx)) return [];
  const rows = await prisma.household.findMany({
    where: buildMySubmittedWhere(ctx.userId, filters),
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
    skip: Math.max(0, offset),
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

export async function countMySubmittedSheets(
  ctx: AuthorizationContext,
  filters: MySubmittedFilters = {},
): Promise<number> {
  if (!canEnter(ctx)) return 0;
  return prisma.household.count({
    where: buildMySubmittedWhere(ctx.userId, filters),
  });
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

export type ChangeCommunityResult =
  | { ok: true; communityName: string }
  | { ok: false; reason: "FORBIDDEN" | "NOT_FOUND" | "INVALID_COMMUNITY" | "NOT_HOLDING" };

/**
 * เปลี่ยนชุมชนของใบ — เผื่อผู้คีย์เลือกผิดตอนเริ่ม (Owner feedback)
 * รหัสไม่ผูกชุมชน (#R7-A) จึงเปลี่ยนชุมชนได้โดยรหัสเดิมคงอยู่ ไม่ต้องออกไปเริ่มใบใหม่
 * เงื่อนไข: ต้องถือ lock ของใบอยู่จริง (กำลังคีย์) และชุมชนใหม่ต้องมีอยู่และ active
 * บันทึก Audit UPDATE เก็บค่า community เดิม→ใหม่ (ตรวจย้อนหลังได้)
 */
export async function changeSheetCommunity(
  ctx: AuthorizationContext,
  sheetId: string,
  communityId: string,
): Promise<ChangeCommunityResult> {
  if (!canEnter(ctx)) return { ok: false, reason: "FORBIDDEN" };

  const community = await prisma.community.findFirst({
    where: { id: communityId, deletedAt: null, isActive: true },
    select: { id: true, nameTh: true },
  });
  if (!community) return { ok: false, reason: "INVALID_COMMUNITY" };

  const sheet = await prisma.paperSheet.findUnique({
    where: { id: sheetId },
    select: { communityId: true, lockedById: true, status: true, lockExpiresAt: true },
  });
  if (!sheet) return { ok: false, reason: "NOT_FOUND" };

  // เฉพาะคนที่ถือ lock อยู่จริง (กำลังคีย์ใบนี้) เท่านั้นจึงเปลี่ยนชุมชนได้
  if (
    sheet.status !== SheetStatus.LOCKED ||
    sheet.lockedById !== ctx.userId ||
    isLockExpired(sheet.lockExpiresAt, new Date())
  ) {
    return { ok: false, reason: "NOT_HOLDING" };
  }
  if (sheet.communityId === communityId) {
    return { ok: true, communityName: community.nameTh }; // เลือกซ้ำเดิม — ไม่ต้องทำอะไร
  }

  const updated = await prisma.paperSheet.updateMany({
    where: { id: sheetId, lockedById: ctx.userId, status: SheetStatus.LOCKED },
    data: { communityId },
  });
  if (updated.count !== 1) return { ok: false, reason: "NOT_HOLDING" };

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "PaperSheet",
    entityId: sheetId,
    changes: { communityId: { old: sheet.communityId, new: communityId } },
  });
  return { ok: true, communityName: community.nameTh };
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
      ? { kind: "NOT_LOCKED", reopen: true }
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
