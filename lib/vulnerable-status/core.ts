import { AuditAction, FieldStatusEnum, Prisma, SheetStatus } from "@prisma/client";
import { nextReportedSeq, REPORTED_SEQ_START } from "../../domain/vulnerable/reported";
import {
  bangkokToday,
  checkTransition,
  displayStatusOf,
  parseEventDate,
  PERSON_STATUS_LABELS,
  resolveStatusScope,
  scopeAllows,
  statusColumns,
  type DisplayStatus,
  type PersonStatus,
  type StatusScope,
} from "../../domain/vulnerable/status";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { decryptText, encryptText } from "../crypto/encryption";
import { CURRENT_KEY_VERSION, getKeyring } from "../crypto/keys";
import { buildUsableHouseholdWhere } from "../household/trusted-where";
import { prisma } from "../prisma";
import { assemblePersonName, formatAge } from "../report/vulnerable-export";
import { reportPersonSchema, statusChangeSchema } from "./validation";

// สถานะกลุ่มเปราะบางหลังการสำรวจ — หน้า /community-status (docs/34)
//
// ข้อมูลที่หัวหน้าชุมชนเห็น (Owner Decision 2026-10-19):
//   ชื่อ · อายุ · บ้านเลขที่ · ประเภทความเปราะบาง (ชื่อประเภท)
//   **ไม่ส่ง** รายละเอียดโรค (PersonVulnerability.detail) · เบอร์โทร · พิกัด · ระดับความเร่งด่วน
//   — ไม่ใช่แค่ไม่แสดง แต่ไม่ select ออกจากฐานข้อมูลเลย กันหลุดไปกับ RSC payload

export interface StatusPersonRow {
  personId: string;
  householdId: string;
  fullName: string;
  ageText: string;
  houseNo: string;
  mooNo: number | null;
  communityId: string;
  communityName: string;
  sheetNo: string;
  /** true = ใบยังไม่ผ่านการตรวจ — ยังไม่ถูกนับในรายงาน แต่บันทึกสถานะไว้ก่อนได้ */
  pendingVerification: boolean;
  vulnerabilityTypes: string[];
  status: DisplayStatus;
  statusLabel: string;
  eventDate: string | null;
  recordedByName: string | null;
  /** แจ้งเพิ่มหลังการสำรวจ (ไม่ได้มาจากกระดาษ) — docs/43 */
  reported: boolean;
  reportedByName: string | null;
}

export interface StatusListResult {
  scope: StatusScope;
  communities: Array<{ id: string; nameTh: string }>;
  selectedCommunityId: string | null;
  rows: StatusPersonRow[];
  truncated: boolean;
}

const MAX_ROWS = 3000;

export function canUpdateVulnerableStatus(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.VULNERABLE_STATUS_UPDATE);
}

export function statusScopeOf(ctx: AuthorizationContext): StatusScope {
  return resolveStatusScope(ctx.roles, ctx.communityIds);
}

function safeDecrypt(value: string | null): string {
  if (!value) return "";
  try {
    return decryptText(value, getKeyring());
  } catch {
    return "(ไม่สามารถแสดงข้อมูลได้)";
  }
}

/**
 * รายชื่อกลุ่มเปราะบางในชุมชนที่ผู้ใช้ดูแล
 * คืน null เมื่อไม่มีสิทธิ์ (ผู้เรียกต้องส่งไป /access-denied)
 */
export async function listStatusPeople(
  ctx: AuthorizationContext,
  requestedCommunityId?: string,
): Promise<StatusListResult | null> {
  if (!canUpdateVulnerableStatus(ctx)) return null;
  const scope = statusScopeOf(ctx);

  const communities = await prisma.community.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(scope.kind === "COMMUNITIES" ? { id: { in: scope.communityIds } } : {}),
    },
    select: { id: true, nameTh: true },
    orderBy: { code: "asc" },
  });

  // ชุมชนที่ขอมาต้องอยู่ในขอบเขต — ค่าแปลกปลอมจาก URL ถูกเพิกเฉย ไม่ใช่ขยายขอบเขต
  const selected = communities.find((c) => c.id === requestedCommunityId)?.id
    ?? (communities.length === 1 ? communities[0].id : null);

  if (communities.length === 0) {
    return { scope, communities, selectedCommunityId: null, rows: [], truncated: false };
  }

  const people = await prisma.vulnerablePerson.findMany({
    where: {
      household: buildUsableHouseholdWhere(
        { status: "ALL", ...(selected ? { communityId: selected } : {}) },
        communities.map((c) => c.id),
      ),
    },
    take: MAX_ROWS + 1,
    orderBy: [{ household: { houseNo: "asc" } }, { seq: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      prefixOther: true,
      nameStatus: true,
      age: true,
      ageMonths: true,
      isActive: true,
      deactivatedReason: true,
      deactivatedAt: true,
      deactivatedBy: { select: { name: true } },
      reportedAt: true,
      reportedBy: { select: { name: true } },
      namePrefix: { select: { nameTh: true } },
      // ชื่อประเภทเท่านั้น — ห้ามเพิ่ม `detail` (รายละเอียดโรค) ตามคำตัดสินเจ้าของระบบ
      vulnerabilities: {
        select: { vulnerabilityType: { select: { nameTh: true } } },
        orderBy: { vulnerabilityType: { sortOrder: "asc" } },
      },
      household: {
        select: {
          id: true,
          houseNo: true,
          mooNo: true,
          communityId: true,
          community: { select: { nameTh: true } },
          sheet: { select: { sheetNo: true, status: true } },
        },
      },
    },
  });

  const truncated = people.length > MAX_ROWS;
  const rows: StatusPersonRow[] = people.slice(0, MAX_ROWS).map((p) => {
    const status = displayStatusOf(p);
    return {
      personId: p.id,
      householdId: p.household.id,
      fullName: assemblePersonName(
        p.namePrefix?.nameTh ?? p.prefixOther ?? "",
        safeDecrypt(p.firstName),
        safeDecrypt(p.lastName),
        p.nameStatus,
      ),
      ageText: formatAge(p.age, p.ageMonths),
      houseNo: p.household.houseNo ?? "",
      mooNo: p.household.mooNo,
      communityId: p.household.communityId,
      communityName: p.household.community.nameTh,
      sheetNo: p.household.sheet.sheetNo,
      pendingVerification: p.household.sheet.status !== SheetStatus.VERIFIED,
      vulnerabilityTypes: p.vulnerabilities.map((v) => v.vulnerabilityType.nameTh),
      status,
      statusLabel: PERSON_STATUS_LABELS[status],
      eventDate: p.deactivatedAt ? p.deactivatedAt.toISOString().slice(0, 10) : null,
      recordedByName: p.isActive ? null : (p.deactivatedBy?.name ?? null),
      reported: p.reportedAt !== null,
      reportedByName: p.reportedBy?.name ?? null,
    };
  });

  // เปิดดูข้อมูลสุขภาพรายบุคคล → Audit READ (ไม่ใส่ PII ลงใน log)
  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "VulnerableStatusList",
    entityId: selected,
    changes: { resultCount: rows.length, scope: scope.kind },
    reason: "view-community-vulnerable-status",
  });

  return { scope, communities, selectedCommunityId: selected, rows, truncated };
}

export type SetStatusResult =
  | { ok: true; status: DisplayStatus; /** จำนวนคนที่เปลี่ยน (มากกว่า 1 เมื่อย้ายออกทั้งบ้าน) */ count: number }
  | {
      ok: false;
      reason:
        | "FORBIDDEN"
        | "INVALID"
        | "INVALID_DATE"
        | "FUTURE_DATE"
        | "TOO_OLD"
        | "NOT_FOUND"
        | "OUT_OF_SCOPE"
        | "UNCHANGED"
        | "CONFLICT"
        | "ERROR";
    };

/**
 * บันทึกสถานะของบุคคลหนึ่ง (เสียชีวิต / ย้ายออก / ไม่เข้าเกณฑ์แล้ว / คืนสถานะ)
 *
 * - ไม่แตะข้อมูลกระดาษ และไม่เปลี่ยนสถานะใบ → ใบที่ตรวจแล้วยังตรวจแล้ว
 * - กันเขียนทับกัน: updateMany มีเงื่อนไขค่าปัจจุบัน ถ้ามีคนเปลี่ยนก่อน → CONFLICT
 *   (รวมกรณีผู้คีย์กำลังบันทึกแก้ใบเดียวกัน ซึ่งล็อกแถวไว้ใน lib/entry/save.ts)
 * - Audit UPDATE เก็บค่าก่อน/หลัง (รหัสสถานะ + วันที่ — ไม่มี PII)
 */
export async function setVulnerableStatus(
  ctx: AuthorizationContext,
  raw: unknown,
  now: Date = new Date(),
): Promise<SetStatusResult> {
  if (!canUpdateVulnerableStatus(ctx)) return { ok: false, reason: "FORBIDDEN" };

  const parsed = statusChangeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID" };
  const { personId, target } = parsed.data;
  // schema ตรวจแล้วว่าอยู่ใน SELECTABLE_STATUSES — zod ไม่ narrow ชนิดจาก refine ให้
  const targetStatus = target as PersonStatus;

  let eventDate: Date | null = null;
  if (targetStatus !== "ACTIVE") {
    const date = parseEventDate(parsed.data.eventDate ?? "", bangkokToday(now));
    if (!date.ok) return { ok: false, reason: date.reason };
    eventDate = date.date;
  }

  const person = await prisma.vulnerablePerson.findFirst({
    where: { id: personId, household: { deletedAt: null } },
    select: {
      id: true,
      isActive: true,
      deactivatedReason: true,
      deactivatedAt: true,
      household: { select: { id: true, communityId: true } },
    },
  });
  if (!person) return { ok: false, reason: "NOT_FOUND" };

  if (!scopeAllows(statusScopeOf(ctx), person.household.communityId)) {
    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.REJECT,
      entityType: "VulnerablePerson",
      entityId: person.id,
      reason: "vulnerable-status-out-of-scope",
    });
    return { ok: false, reason: "OUT_OF_SCOPE" };
  }

  const current = displayStatusOf(person);
  const transition = checkTransition(current, targetStatus);
  if (!transition.ok) return { ok: false, reason: transition.reason };

  const next = statusColumns(targetStatus, eventDate, ctx.userId);

  // ย้ายออกทั้งบ้าน (docs/43) — ทุกคนที่ยังต้องดูแลในบ้านเดียวกัน ในคำสั่งเดียว
  // คนที่ถูกบันทึกสถานะอื่นไว้แล้ว (เช่น เสียชีวิต) ไม่ถูกเขียนทับ
  if (parsed.data.wholeHousehold && targetStatus === "MOVED_OUT") {
    let count: number;
    try {
      const updated = await prisma.vulnerablePerson.updateMany({
        where: { householdId: person.household.id, isActive: true },
        data: next,
      });
      count = updated.count;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) return { ok: false, reason: "ERROR" };
      throw error;
    }
    if (count === 0) return { ok: false, reason: "CONFLICT" };
    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.UPDATE,
      entityType: "Household",
      entityId: person.household.id,
      changes: {
        status: { old: "ACTIVE", new: "MOVED_OUT" },
        personCount: count,
        eventDate: eventDate ? eventDate.toISOString().slice(0, 10) : null,
      },
      reason: "vulnerable-household-moved-out",
    });
    return { ok: true, status: targetStatus, count };
  }

  try {
    const updated = await prisma.vulnerablePerson.updateMany({
      where: {
        id: person.id,
        isActive: person.isActive,
        deactivatedReason: person.deactivatedReason,
      },
      data: next,
    });
    if (updated.count !== 1) return { ok: false, reason: "CONFLICT" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) return { ok: false, reason: "ERROR" };
    throw error;
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.UPDATE,
    entityType: "VulnerablePerson",
    entityId: person.id,
    changes: {
      status: { old: current, new: targetStatus },
      eventDate: {
        old: person.deactivatedAt ? person.deactivatedAt.toISOString().slice(0, 10) : null,
        new: eventDate ? eventDate.toISOString().slice(0, 10) : null,
      },
      householdId: person.household.id,
    },
    reason: "vulnerable-status-change",
  });

  return { ok: true, status: targetStatus, count: 1 };
}

// ---------------------------------------------------------------------------
// แจ้งเพิ่มคนเปราะบางรายใหม่ (docs/43 · Owner Decision 2026-10-26: นับทันที)
// ---------------------------------------------------------------------------

export interface ReportFormOptions {
  households: Array<{ id: string; label: string; communityName: string }>;
  vulnerabilityTypes: Array<{ id: string; nameTh: string; requiresDetail: boolean; detailLabel: string | null }>;
  namePrefixes: Array<{ id: string; nameTh: string }>;
}

/** ตัวเลือกของฟอร์มแจ้งเพิ่ม — บ้านในขอบเขต (ไม่มีชื่อ/เบอร์ มีแค่บ้านเลขที่ + รหัสใบ) */
export async function getReportFormOptions(
  ctx: AuthorizationContext,
  communityId?: string | null,
): Promise<ReportFormOptions | null> {
  if (!canUpdateVulnerableStatus(ctx)) return null;
  const scope = statusScopeOf(ctx);
  const scopeIds = scope.kind === "COMMUNITIES" ? scope.communityIds : undefined;
  if (scopeIds && scopeIds.length === 0) return { households: [], vulnerabilityTypes: [], namePrefixes: [] };

  const [households, vulnerabilityTypes, namePrefixes] = await Promise.all([
    prisma.household.findMany({
      where: buildUsableHouseholdWhere({ status: "ALL", ...(communityId ? { communityId } : {}) }, scopeIds),
      orderBy: [{ community: { code: "asc" } }, { houseNo: "asc" }],
      take: MAX_ROWS,
      select: {
        id: true,
        houseNo: true,
        mooNo: true,
        soi: true,
        community: { select: { nameTh: true } },
        sheet: { select: { sheetNo: true } },
      },
    }),
    prisma.vulnerabilityType.findMany({
      orderBy: { sortOrder: "asc" },
      select: { id: true, nameTh: true, requiresDetail: true, detailLabel: true },
    }),
    prisma.namePrefix.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, nameTh: true } }),
  ]);

  return {
    households: households.map((h) => ({
      id: h.id,
      label: [
        h.houseNo ? `บ้านเลขที่ ${h.houseNo}` : "ไม่มีบ้านเลขที่",
        h.mooNo && h.mooNo > 0 ? `หมู่ ${h.mooNo}` : null,
        h.soi ? `ซ.${h.soi}` : null,
        h.sheet.sheetNo,
      ].filter(Boolean).join(" · "),
      communityName: h.community.nameTh,
    })),
    vulnerabilityTypes,
    namePrefixes,
  };
}

export type ReportPersonResult =
  | { ok: true; personId: string }
  | { ok: false; reason: "FORBIDDEN" | "INVALID" | "NOT_FOUND" | "OUT_OF_SCOPE" | "CONFLICT" | "ERROR"; message?: string };

/**
 * เพิ่มคนเปราะบางที่ไม่ได้อยู่ในกระดาษ ลงในบ้านที่สำรวจแล้ว
 * - นับทันที (ไม่รอตรวจ) แต่มีป้าย "หัวหน้าชุมชนแจ้งเพิ่ม" ทุกที่ที่แสดงรายชื่อ
 * - seq ≥ 1001 แยกจากแถวกระดาษ · แก้ใบกระดาษภายหลังไม่ลบแถวนี้ (lib/entry/save.ts)
 * - ล็อกแถวบ้านก่อนหา seq ถัดไป — กันสองคนเพิ่มพร้อมกันได้เลขซ้ำ
 * - Audit CREATE (ไม่มี PII — รหัสบ้าน + จำนวนประเภท)
 */
export async function reportVulnerablePerson(
  ctx: AuthorizationContext,
  raw: unknown,
  now: Date = new Date(),
): Promise<ReportPersonResult> {
  if (!canUpdateVulnerableStatus(ctx)) return { ok: false, reason: "FORBIDDEN" };
  const parsed = reportPersonSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "INVALID", message: parsed.error.issues[0]?.message };
  const input = parsed.data;

  const household = await prisma.household.findFirst({
    where: { AND: [{ id: input.householdId }, buildUsableHouseholdWhere({ status: "ALL" })] },
    select: { id: true, communityId: true },
  });
  if (!household) return { ok: false, reason: "NOT_FOUND" };
  if (!scopeAllows(statusScopeOf(ctx), household.communityId)) {
    await writeAuditLog({
      userId: ctx.userId,
      action: AuditAction.REJECT,
      entityType: "Household",
      entityId: household.id,
      reason: "vulnerable-person-report-out-of-scope",
    });
    return { ok: false, reason: "OUT_OF_SCOPE" };
  }

  const typeIds = [...new Set(input.vulnerabilityTypeIds)];
  const knownTypes = await prisma.vulnerabilityType.count({ where: { id: { in: typeIds } } });
  if (knownTypes !== typeIds.length) return { ok: false, reason: "INVALID", message: "ลักษณะความเปราะบางไม่ถูกต้อง" };
  if (input.namePrefixId && !(await prisma.namePrefix.findUnique({ where: { id: input.namePrefixId }, select: { id: true } }))) {
    return { ok: false, reason: "INVALID", message: "คำนำหน้าไม่ถูกต้อง" };
  }

  const keyring = getKeyring();
  const enc = (value: string | undefined) => (value ? encryptText(value, keyring, CURRENT_KEY_VERSION) : null);
  let personId: string;
  try {
    personId = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM household WHERE id = ${household.id} FOR UPDATE`;
      const existing = await tx.vulnerablePerson.findMany({
        where: { householdId: household.id, seq: { gte: REPORTED_SEQ_START } },
        select: { seq: true },
      });
      const person = await tx.vulnerablePerson.create({
        data: {
          householdId: household.id,
          seq: nextReportedSeq(existing.map((p) => p.seq)),
          namePrefixId: input.namePrefixId ?? null,
          firstName: enc(input.firstName),
          lastName: enc(input.lastName),
          age: input.ageYears ?? null,
          ageMonths: input.ageYears === 0 ? (input.ageMonths ?? null) : null,
          ageStatus: input.ageYears === undefined ? FieldStatusEnum.BLANK_IN_PAPER : FieldStatusEnum.HAS_VALUE,
          phone: enc(input.phone),
          phoneStatus: input.phone ? FieldStatusEnum.HAS_VALUE : FieldStatusEnum.BLANK_IN_PAPER,
          reportedAt: now,
          reportedById: ctx.userId,
        },
        select: { id: true },
      });
      await tx.personVulnerability.createMany({
        data: typeIds.map((typeId) => ({
          personId: person.id,
          vulnerabilityTypeId: typeId,
          detail: enc(input.details[typeId] || undefined),
          // อายุครรภ์/อายุลูกที่แจ้งเป็นค่า ณ วันที่แจ้ง (ไม่ใช่วันสำรวจของบ้าน)
          referenceDate: now,
        })),
      });
      return person.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, reason: error.code === "P2002" ? "CONFLICT" : "ERROR" };
    }
    throw error;
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.CREATE,
    entityType: "VulnerablePerson",
    entityId: personId,
    changes: { householdId: household.id, typeCount: typeIds.length },
    reason: "vulnerable-person-reported",
  });
  return { ok: true, personId };
}
