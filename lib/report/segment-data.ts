// ชั้นดึงข้อมูลรายชื่อของ segment (Drill-down + Excel) — ถอดรหัส PII ที่นี่
// -----------------------------------------------------------------------------
// ⚠️ คืนข้อมูลส่วนบุคคล (ชื่อ/เบอร์/พิกัด) — ตัวเรียก (route) ต้องบังคับ permission
//   ตาม permissionForSegment() + เขียน Audit Log ทุกครั้ง (READ ตอนดู, EXPORT ตอนโหลด)
// where ทุกอันถูก AND กับ base (trusted-where) → เคารพตัวกรอง + ขอบเขตข้อมูลเดิมอัตโนมัติ

import { VehicleType } from "@prisma/client";
import { prisma } from "../prisma";
import { decryptText, type Keyring } from "../crypto/encryption";
import {
  buildUsableHouseholdWhere,
  type HouseholdAnalyticsFilters,
} from "../household/trusted-where";
import type { AuthorizationContext } from "../authz/types";
import { effectiveTriage, triageLabel, type TriageCode } from "../../domain/triage";
import {
  assemblePersonName,
  formatAge,
  formatCoord,
  formatDiseases,
  statusLabel,
  type VulnerableExportRow,
} from "./vulnerable-export";
import type { SegmentDescriptor } from "./segments";

export interface HouseholdSegmentRow {
  seq: number;
  respondentName: string;
  respondentPhone: string;
  houseNo: string;
  mooNo: string;
  soi: string;
  road: string;
  tambon: string;
  community: string;
  coord: string;
  surveyedAt: string;
  sheetNo: string;
  status: string;
  detail: string;
}

export type SegmentRows =
  | { kind: "household"; rows: HouseholdSegmentRow[] }
  | { kind: "person"; rows: VulnerableExportRow[] };

function baseWhere(ctx: AuthorizationContext, filters: HouseholdAnalyticsFilters) {
  return buildUsableHouseholdWhere(filters, ctx.isGlobalScope ? undefined : ctx.communityIds);
}

function makeSafeDecrypt(keyring: Keyring) {
  return (value: string | null): string => {
    if (!value) return "";
    try {
      return decryptText(value, keyring);
    } catch {
      return "(ถอดรหัสไม่ได้)";
    }
  };
}

function assembleRespondentName(prefix: string, first: string, last: string): string {
  const full = `${prefix}${first}${last ? ` ${last}` : ""}`.trim();
  return full || "(ไม่มีชื่อ)";
}

function formatThaiDate(date: Date | null): string {
  if (!date) return "";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear() + 543}`;
}

async function fetchHouseholdRows(
  ctx: AuthorizationContext,
  filters: HouseholdAnalyticsFilters,
  seg: SegmentDescriptor,
  keyring: Keyring,
): Promise<HouseholdSegmentRow[]> {
  const where = { AND: [baseWhere(ctx, filters), seg.householdWhere ?? {}] };
  const households = await prisma.household.findMany({
    where,
    orderBy: [{ community: { code: "asc" } }, { houseNo: "asc" }],
    select: {
      id: true,
      houseNo: true,
      mooNo: true,
      soi: true,
      road: true,
      latitude: true,
      longitude: true,
      coordinateRawText: true,
      surveyedAt: true,
      respondentFirstName: true,
      respondentLastName: true,
      respondentPhone: true,
      respondentPrefixOther: true,
      respondentPrefix: { select: { nameTh: true } },
      community: { select: { nameTh: true, code: true } },
      tambon: { select: { nameTh: true } },
      sheet: { select: { sheetNo: true, status: true } },
    },
  });

  // "อื่นๆ" รายละเอียด (ข้อ 6) — ดึงแยกให้ type สะอาด แล้ว map เข้า household
  const detailByHousehold = new Map<string, string>();
  if (seg.detail && households.length) {
    const ids = households.map((h) => h.id);
    const safeDecrypt = makeSafeDecrypt(keyring);
    if (seg.detail.relation === "assistance") {
      const needs = await prisma.assistanceNeed.findMany({
        where: { householdId: { in: ids }, needTypeId: seg.detail.typeValue },
        select: { householdId: true, detail: true },
      });
      for (const n of needs) {
        const text = safeDecrypt(n.detail);
        if (text) detailByHousehold.set(n.householdId, text);
      }
    } else if (seg.detail.relation === "vehicle") {
      const vehicles = await prisma.evacuationVehicle.findMany({
        where: { householdId: { in: ids }, vehicleType: seg.detail.typeValue as VehicleType },
        select: { householdId: true, detail: true },
      });
      for (const v of vehicles) {
        if (v.detail) detailByHousehold.set(v.householdId, v.detail);
      }
    }
  }

  const safeDecrypt = makeSafeDecrypt(keyring);
  return households.map((h, index) => ({
    seq: index + 1,
    respondentName: assembleRespondentName(
      h.respondentPrefix?.nameTh ?? h.respondentPrefixOther ?? "",
      safeDecrypt(h.respondentFirstName),
      safeDecrypt(h.respondentLastName),
    ),
    respondentPhone: safeDecrypt(h.respondentPhone),
    houseNo: h.houseNo ?? "",
    mooNo: h.mooNo != null && h.mooNo > 0 ? String(h.mooNo) : "",
    soi: h.soi ?? "",
    road: h.road ?? "",
    tambon: h.tambon?.nameTh ?? "",
    community: h.community?.nameTh ?? "(ไม่ระบุชุมชน)",
    coord: formatCoord(h.latitude?.toString() ?? null, h.longitude?.toString() ?? null, h.coordinateRawText),
    surveyedAt: formatThaiDate(h.surveyedAt),
    sheetNo: h.sheet?.sheetNo ?? "",
    status: statusLabel(h.sheet?.status ?? ""),
    detail: detailByHousehold.get(h.id) ?? "",
  }));
}

async function fetchPersonRows(
  ctx: AuthorizationContext,
  filters: HouseholdAnalyticsFilters,
  seg: SegmentDescriptor,
  keyring: Keyring,
): Promise<VulnerableExportRow[]> {
  const persons = await prisma.vulnerablePerson.findMany({
    where: { household: baseWhere(ctx, filters), isActive: true, ...(seg.personWhere ?? {}) },
    orderBy: [{ seq: "asc" }],
    select: {
      seq: true,
      firstName: true,
      lastName: true,
      nameStatus: true,
      age: true,
      ageMonths: true,
      triageLevel: true,
      prefixOther: true,
      namePrefix: { select: { nameTh: true } },
      vulnerabilities: {
        select: { detail: true, vulnerabilityType: { select: { nameTh: true, basePriority: true } } },
      },
      household: {
        select: {
          houseNo: true,
          mooNo: true,
          soi: true,
          road: true,
          latitude: true,
          longitude: true,
          coordinateRawText: true,
          community: { select: { nameTh: true, code: true } },
          tambon: { select: { nameTh: true } },
          sheet: { select: { sheetNo: true, status: true } },
        },
      },
    },
  });

  const safeDecrypt = makeSafeDecrypt(keyring);
  const rows: VulnerableExportRow[] = [];
  for (const p of persons) {
    const level = effectiveTriage(
      p.triageLevel as TriageCode | null,
      p.vulnerabilities.map((v) => v.vulnerabilityType.basePriority as TriageCode),
    );
    if (seg.triage) {
      const want = seg.triage === "UNASSESSED" ? null : seg.triage;
      if (level !== want) continue;
    }
    const h = p.household;
    rows.push({
      community: h.community?.nameTh ?? "(ไม่ระบุชุมชน)",
      communityCode: h.community?.code ?? "",
      seq: p.seq,
      fullName: assemblePersonName(
        p.namePrefix?.nameTh ?? p.prefixOther ?? "",
        safeDecrypt(p.firstName),
        safeDecrypt(p.lastName),
        p.nameStatus,
      ),
      ageText: formatAge(p.age, p.ageMonths),
      diseases: formatDiseases(
        p.vulnerabilities.map((v) => ({ nameTh: v.vulnerabilityType.nameTh, detail: safeDecrypt(v.detail) })),
      ),
      triage: triageLabel(level),
      coord: formatCoord(h.latitude?.toString() ?? null, h.longitude?.toString() ?? null, h.coordinateRawText),
      houseNo: h.houseNo ?? "",
      mooNo: h.mooNo != null && h.mooNo > 0 ? String(h.mooNo) : "",
      soi: h.soi ?? "",
      road: h.road ?? "",
      tambon: h.tambon?.nameTh ?? "",
      sheetNo: h.sheet?.sheetNo ?? "",
      status: h.sheet?.status ?? "",
    });
  }
  return rows;
}

/** ดึงรายชื่อของ segment (household หรือ person) — ตัวเรียกต้องเช็ค permission ก่อน */
export async function fetchSegmentRows(
  ctx: AuthorizationContext,
  filters: HouseholdAnalyticsFilters,
  seg: SegmentDescriptor,
  keyring: Keyring,
): Promise<SegmentRows> {
  if (seg.kind === "person") {
    return { kind: "person", rows: await fetchPersonRows(ctx, filters, seg, keyring) };
  }
  return { kind: "household", rows: await fetchHouseholdRows(ctx, filters, seg, keyring) };
}
