// สรุป "รายละเอียด (อื่นๆ)" แบบนับรายข้อความ — ตอบข้อ 6: "อื่นๆ" คืออะไรบ้าง กี่คน
// -----------------------------------------------------------------------------
// aggregate ล้วน (ข้อความ + จำนวน) ไม่คืนชื่อ/ที่อยู่รายบุคคล จึงเบากว่า drill-down รายชื่อ
// ⚠️ ยังเป็นข้อมูลสุขภาพ (รายละเอียดโรค) — ตัวเรียกต้องบังคับ permission (MEDICAL_DASHBOARD_VIEW)
//    + Audit READ · where ถูก AND กับ base (ตัวกรอง/ขอบเขตเดิม) อัตโนมัติ

import { VehicleType } from "@prisma/client";
import { prisma } from "../prisma";
import { decryptText, type Keyring } from "../crypto/encryption";
import {
  buildUsableHouseholdWhere,
  type HouseholdAnalyticsFilters,
} from "../household/trusted-where";
import type { AuthorizationContext } from "../authz/types";

export interface DetailItem {
  text: string;
  count: number;
}
export interface DetailBreakdown {
  items: DetailItem[];
  totalRecords: number; // จำนวนคน/ครัวเรือนที่เลือกประเภทนี้ทั้งหมด
  withDetail: number; // ระบุข้อความรายละเอียด
  withoutDetail: number; // เลือกแต่ไม่ได้เขียนรายละเอียด
}

/**
 * รวมข้อความรายละเอียดเป็นรายการ + นับจำนวนที่ซ้ำกัน (Pure — ทดสอบได้)
 * ค่าว่าง/space นับเป็น "ไม่ได้ระบุ" · ที่เหลือ trim แล้วจับกลุ่มด้วยข้อความตรงตัว
 */
export function groupDetails(rawDetails: (string | null)[]): DetailBreakdown {
  const map = new Map<string, number>();
  let withDetail = 0;
  let withoutDetail = 0;
  for (const raw of rawDetails) {
    const text = (raw ?? "").trim();
    if (!text) {
      withoutDetail += 1;
      continue;
    }
    withDetail += 1;
    map.set(text, (map.get(text) ?? 0) + 1);
  }
  const items = [...map.entries()]
    .map(([text, count]) => ({ text, count }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, "th"));
  return { items, totalRecords: rawDetails.length, withDetail, withoutDetail };
}

function decryptDetails(rows: { detail: string | null }[], keyring: Keyring): (string | null)[] {
  return rows.map((row) => {
    if (!row.detail) return null;
    try {
      return decryptText(row.detail, keyring);
    } catch {
      return "(ถอดรหัสไม่ได้)";
    }
  });
}

/** ดึงรายละเอียด "อื่นๆ" ของลักษณะความเปราะบางหนึ่งประเภท แล้วสรุปเป็นรายข้อความ + จำนวน */
export async function fetchVulnerabilityDetailBreakdown(
  ctx: AuthorizationContext,
  filters: HouseholdAnalyticsFilters,
  vulnerabilityTypeId: string,
  keyring: Keyring,
): Promise<DetailBreakdown> {
  const base = buildUsableHouseholdWhere(filters, ctx.isGlobalScope ? undefined : ctx.communityIds);
  const rows = await prisma.personVulnerability.findMany({
    where: {
      vulnerabilityTypeId,
      person: { isActive: true, household: base },
    },
    select: { detail: true },
  });
  return groupDetails(decryptDetails(rows, keyring));
}

/** ดึงรายละเอียดของประเภทความช่วยเหลือหนึ่งประเภท แล้วสรุปเป็นรายข้อความ + จำนวนครัวเรือน */
export async function fetchAssistanceDetailBreakdown(
  ctx: AuthorizationContext,
  filters: HouseholdAnalyticsFilters,
  needTypeId: string,
  keyring: Keyring,
): Promise<DetailBreakdown> {
  const base = buildUsableHouseholdWhere(filters, ctx.isGlobalScope ? undefined : ctx.communityIds);
  const rows = await prisma.assistanceNeed.findMany({
    where: { needTypeId, household: base },
    select: { detail: true },
  });
  return groupDetails(decryptDetails(rows, keyring));
}

/** ดึงรายละเอียดของยานพาหนะ “อื่นๆ” แล้วสรุปเป็นรายข้อความ + จำนวนครัวเรือน */
export async function fetchVehicleDetailBreakdown(
  ctx: AuthorizationContext,
  filters: HouseholdAnalyticsFilters,
  vehicleType: VehicleType,
): Promise<DetailBreakdown> {
  const base = buildUsableHouseholdWhere(filters, ctx.isGlobalScope ? undefined : ctx.communityIds);
  const rows = await prisma.evacuationVehicle.findMany({
    where: { vehicleType, household: base },
    select: { detail: true },
  });
  return groupDetails(rows.map((row) => row.detail));
}
