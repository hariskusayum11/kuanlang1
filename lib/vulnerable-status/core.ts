import { AuditAction, Prisma, SheetStatus } from "@prisma/client";
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
import { decryptText } from "../crypto/encryption";
import { getKeyring } from "../crypto/keys";
import { buildUsableHouseholdWhere } from "../household/trusted-where";
import { prisma } from "../prisma";
import { assemblePersonName, formatAge } from "../report/vulnerable-export";
import { statusChangeSchema } from "./validation";

// สถานะกลุ่มเปราะบางหลังการสำรวจ — หน้า /community-status (docs/34)
//
// ข้อมูลที่หัวหน้าชุมชนเห็น (Owner Decision 2026-10-19):
//   ชื่อ · อายุ · บ้านเลขที่ · ประเภทความเปราะบาง (ชื่อประเภท)
//   **ไม่ส่ง** รายละเอียดโรค (PersonVulnerability.detail) · เบอร์โทร · พิกัด · ระดับความเร่งด่วน
//   — ไม่ใช่แค่ไม่แสดง แต่ไม่ select ออกจากฐานข้อมูลเลย กันหลุดไปกับ RSC payload

export interface StatusPersonRow {
  personId: string;
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
      namePrefix: { select: { nameTh: true } },
      // ชื่อประเภทเท่านั้น — ห้ามเพิ่ม `detail` (รายละเอียดโรค) ตามคำตัดสินเจ้าของระบบ
      vulnerabilities: {
        select: { vulnerabilityType: { select: { nameTh: true } } },
        orderBy: { vulnerabilityType: { sortOrder: "asc" } },
      },
      household: {
        select: {
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
  | { ok: true; status: DisplayStatus }
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

  return { ok: true, status: targetStatus };
}
