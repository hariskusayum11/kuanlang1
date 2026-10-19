import { AuditAction, EvacuationSiteType, Prisma, SheetStatus } from "@prisma/client";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { buildUsableHouseholdWhere } from "../household/trusted-where";
import { prisma } from "../prisma";
import { updateShelterSchema, verifyShelterSchema } from "./validation";

// ยืนยันบ้านพักพิง (Owner Decision 2026-10-19 · docs/38)
//
//   ติ๊ก "ยินยอมเป็นจุดพักพิง" ในแบบสอบถาม = แค่ "เสนอตัว"
//   → เจ้าหน้าที่ติดต่อเจ้าของ ยืนยันความจุ/สิ่งอำนวยความสะดวก → เป็นจุดพักพิงจริง (EvacuationSite RELATIVE_HOME)
//   → แสดงบนหน้าสาธารณะเฉพาะเมื่อเจ้าของยินยอมให้เผยแพร่ "อีกครั้ง" (isPublic)
//
// บ้านพักพิงเป็นบ้านส่วนตัว — ถ้าไม่ได้ยินยอมเผยแพร่ ตำแหน่งต้องอยู่ในระบบหลังบ้านเท่านั้น

export function canVerifyShelters(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.SHELTER_VERIFY);
}

export interface ShelterCandidateRow {
  householdId: string;
  sheetNo: string;
  communityName: string;
  houseNo: string | null;
  mooNo: number | null;
  hasCoordinates: boolean;
}

export interface VerifiedShelterRow {
  siteId: string;
  householdId: string | null;
  name: string;
  communityName: string;
  capacity: number | null;
  hasToilet: boolean;
  hasKitchen: boolean;
  hasPowerBackup: boolean;
  isAccessibleForDisabled: boolean;
  isPublic: boolean;
  isActive: boolean;
  verifiedAt: Date | null;
  verifiedByName: string | null;
}

export interface ShelterOverview {
  candidates: ShelterCandidateRow[];
  verified: VerifiedShelterRow[];
}

/** null = ไม่มีสิทธิ์ */
export async function getShelterOverview(ctx: AuthorizationContext): Promise<ShelterOverview | null> {
  if (!canVerifyShelters(ctx)) return null;
  const [households, sites] = await Promise.all([
    prisma.household.findMany({
      where: {
        AND: [
          buildUsableHouseholdWhere({ status: "VERIFIED" }),
          { floodRiskProfile: { canBeHostHouse: true } },
          // ยังไม่ได้ยืนยัน (หรือเคยยืนยันแล้วถูกยกเลิก → ยืนยันใหม่ได้)
          { OR: [{ hostShelter: null }, { hostShelter: { isActive: false } }] },
        ],
      },
      orderBy: [{ community: { code: "asc" } }, { houseNo: "asc" }],
      select: {
        id: true,
        houseNo: true,
        mooNo: true,
        latitude: true,
        longitude: true,
        community: { select: { nameTh: true } },
        sheet: { select: { sheetNo: true } },
      },
    }),
    prisma.evacuationSite.findMany({
      where: { sourceHouseholdId: { not: null } },
      orderBy: [{ isActive: "desc" }, { community: { code: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        sourceHouseholdId: true,
        name: true,
        capacity: true,
        hasToilet: true,
        hasKitchen: true,
        hasPowerBackup: true,
        isAccessibleForDisabled: true,
        isPublic: true,
        isActive: true,
        verifiedAt: true,
        verifiedBy: { select: { name: true } },
        community: { select: { nameTh: true } },
      },
    }),
  ]);

  return {
    candidates: households.map((h) => ({
      householdId: h.id,
      sheetNo: h.sheet.sheetNo,
      communityName: h.community.nameTh,
      houseNo: h.houseNo,
      mooNo: h.mooNo,
      hasCoordinates: h.latitude != null && h.longitude != null,
    })),
    verified: sites.filter((s) => s.isActive).map((s) => ({
      siteId: s.id,
      householdId: s.sourceHouseholdId,
      name: s.name,
      communityName: s.community.nameTh,
      capacity: s.capacity,
      hasToilet: s.hasToilet,
      hasKitchen: s.hasKitchen,
      hasPowerBackup: s.hasPowerBackup,
      isAccessibleForDisabled: s.isAccessibleForDisabled,
      isPublic: s.isPublic,
      isActive: s.isActive,
      verifiedAt: s.verifiedAt,
      verifiedByName: s.verifiedBy?.name ?? null,
    })),
  };
}

export type ShelterResult =
  | { ok: true; siteId: string }
  | {
      ok: false;
      reason: "FORBIDDEN" | "INVALID" | "NOT_FOUND" | "NOT_ELIGIBLE" | "NO_COORDINATES" | "ALREADY_VERIFIED" | "ERROR";
      message?: string;
    };

/**
 * ยืนยันบ้านที่เสนอตัวเป็นจุดพักพิง → สร้าง/เปิดจุดพักพิงที่พิกัดบ้าน
 * เงื่อนไข: ใบตรวจแล้ว · ติ๊กยินยอมในแบบสอบถาม · มีพิกัด · ยังไม่มีจุดพักพิงที่ใช้งานอยู่
 */
export async function verifyHostShelter(ctx: AuthorizationContext, raw: unknown, now: Date = new Date()): Promise<ShelterResult> {
  if (!canVerifyShelters(ctx)) return { ok: false, reason: "FORBIDDEN" };
  const parsed = verifyShelterSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID", message: parsed.error.issues[0]?.message };
  const { householdId, ownerContacted: _confirmed, ...fields } = parsed.data;

  const household = await prisma.household.findFirst({
    where: { AND: [{ id: householdId }, buildUsableHouseholdWhere({ status: "ALL" })] },
    select: {
      id: true,
      communityId: true,
      latitude: true,
      longitude: true,
      sheet: { select: { status: true } },
      floodRiskProfile: { select: { canBeHostHouse: true } },
      hostShelter: { select: { id: true, isActive: true } },
    },
  });
  if (!household) return { ok: false, reason: "NOT_FOUND" };
  if (household.sheet.status !== SheetStatus.VERIFIED || household.floodRiskProfile?.canBeHostHouse !== true) {
    return { ok: false, reason: "NOT_ELIGIBLE" };
  }
  if (household.latitude == null || household.longitude == null) return { ok: false, reason: "NO_COORDINATES" };
  if (household.hostShelter?.isActive) return { ok: false, reason: "ALREADY_VERIFIED" };

  const data = {
    ...fields,
    type: EvacuationSiteType.RELATIVE_HOME,
    communityId: household.communityId,
    latitude: household.latitude,
    longitude: household.longitude,
    isActive: true,
    verifiedAt: now,
    verifiedById: ctx.userId,
  };

  let siteId: string;
  try {
    if (household.hostShelter) {
      // เคยยืนยันแล้วถูกยกเลิก → เปิดจุดเดิมกลับ (sourceHouseholdId เป็น unique)
      await prisma.evacuationSite.update({ where: { id: household.hostShelter.id }, data });
      siteId = household.hostShelter.id;
    } else {
      const created = await prisma.evacuationSite.create({
        data: { ...data, sourceHouseholdId: household.id },
        select: { id: true },
      });
      siteId = created.id;
    }
  } catch (error) {
    // แพ้ race กับเจ้าหน้าที่อีกคนที่ยืนยันบ้านเดียวกันพร้อมกัน (unique sourceHouseholdId)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, reason: "ALREADY_VERIFIED" };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) return { ok: false, reason: "ERROR" };
    throw error;
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.VERIFY,
    entityType: "EvacuationSite",
    entityId: siteId,
    changes: { householdId, capacity: fields.capacity, isPublic: fields.isPublic },
    reason: "host-shelter-verified",
  });
  return { ok: true, siteId };
}

/** แก้ความจุ/สิ่งอำนวยความสะดวก/การเผยแพร่ ของบ้านพักพิงที่ยืนยันแล้ว */
export async function updateHostShelter(ctx: AuthorizationContext, raw: unknown): Promise<ShelterResult> {
  if (!canVerifyShelters(ctx)) return { ok: false, reason: "FORBIDDEN" };
  const parsed = updateShelterSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID", message: parsed.error.issues[0]?.message };
  const { siteId, ...fields } = parsed.data;

  const before = await prisma.evacuationSite.findFirst({
    where: { id: siteId, sourceHouseholdId: { not: null }, isActive: true },
    select: { capacity: true, isPublic: true, name: true },
  });
  if (!before) return { ok: false, reason: "NOT_FOUND" };
  await prisma.evacuationSite.update({ where: { id: siteId }, data: fields });
  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "EvacuationSite",
    entityId: siteId,
    changes: { before, after: { capacity: fields.capacity, isPublic: fields.isPublic, name: fields.name } },
    reason: "host-shelter-updated",
  });
  return { ok: true, siteId };
}

/** ยกเลิกการเป็นจุดพักพิง (เจ้าของเปลี่ยนใจ/ย้ายออก) — ไม่ลบจริง บ้านกลับไปอยู่ในรายการรอยืนยัน */
export async function revokeHostShelter(ctx: AuthorizationContext, siteId: string): Promise<ShelterResult> {
  if (!canVerifyShelters(ctx)) return { ok: false, reason: "FORBIDDEN" };
  const updated = await prisma.evacuationSite.updateMany({
    where: { id: siteId, sourceHouseholdId: { not: null }, isActive: true },
    data: { isActive: false, isPublic: false },
  });
  if (updated.count !== 1) return { ok: false, reason: "NOT_FOUND" };
  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "EvacuationSite",
    entityId: siteId,
    changes: { isActive: { old: true, new: false } },
    reason: "host-shelter-revoked",
  });
  return { ok: true, siteId };
}
