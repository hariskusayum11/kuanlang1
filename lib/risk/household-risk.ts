// โหลดครัวเรือน VERIFIED ในรูปแบบที่ domain/rules/impact.ts ใช้คำนวณ (docs/40)
// ---------------------------------------------------------------------------
// ใช้ร่วมกัน: หน้า /risk · ชั้น "ลำดับการช่วยเหลือ" บน /map · ตัวอย่างผลกระทบก่อนบันทึกกฎ
// - ไม่มีเพดานจำนวน (เดิม RISK_LIST_LIMIT = 500 ทำให้บ้านหลังที่ 501 หายเงียบ)
//   ดึงเฉพาะคอลัมน์ที่ใช้คำนวณ + ชนิดความเปราะบาง (ไม่ดึงชื่อ/เบอร์/โรค) จึงเบาพอสำหรับหลักพันหลัง
// - เกณฑ์ "ใบที่ใช้ได้" เดียวกับแผนที่และแดชบอร์ด (buildVerifiedMapHouseholdWhere)
// - ไม่มี RBAC ในไฟล์นี้ — ผู้เรียกต้องตรวจสิทธิ์ก่อนเสมอ

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { buildVerifiedMapHouseholdWhere } from "../household/trusted-where";
import { calculateFloodDepthCm } from "../../domain/flood/depth";
import type { TriageCode } from "../../domain/triage";
import type { RuleHousehold } from "../../domain/rules/impact";

export interface RiskHouseholdFilters {
  communityId?: string;
  tambonId?: string;
  dateFrom?: string;
  dateTo?: string;
}

const RISK_HOUSEHOLD_SELECT = {
  id: true,
  houseNo: true,
  mooNo: true,
  latitude: true,
  longitude: true,
  sheet: { select: { sheetNo: true } },
  community: { select: { nameTh: true } },
  floodRiskProfile: {
    select: {
      floorLevelVsRoad: true,
      hasFloodedBefore: true,
      floodDepthMetersRaw: true,
      floodDepthCmRaw: true,
      maxFloodDepthCm: true,
      lastFloodDurationDays: true,
      hasSurvivalKit: true,
      nearestEvacSiteType: true,
    },
  },
  vulnerablePersons: {
    where: { isActive: true },
    select: {
      triageLevel: true,
      vulnerabilities: { select: { vulnerabilityType: { select: { code: true } } } },
    },
  },
} satisfies Prisma.HouseholdSelect;

export interface RiskHouseholdRow extends RuleHousehold {
  id: string;
  sheetNo: string;
  communityTh: string;
  houseNo: string | null;
  mooNo: number | null;
  lat: number | null;
  lng: number | null;
}

function coordinate(lat: Prisma.Decimal | null, lng: Prisma.Decimal | null): { lat: number; lng: number } | null {
  if (lat === null || lng === null) return null;
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

/** ครัวเรือน VERIFIED ทั้งหมดตามตัวกรอง (ไม่จำกัดจำนวน) */
export async function loadRiskHouseholds(
  filters: RiskHouseholdFilters = {},
  communityIds?: readonly string[],
): Promise<RiskHouseholdRow[]> {
  const households = await prisma.household.findMany({
    where: buildVerifiedMapHouseholdWhere(filters, communityIds),
    select: RISK_HOUSEHOLD_SELECT,
    orderBy: { id: "asc" },
  });
  return households.map((h) => {
    const p = h.floodRiskProfile;
    const point = coordinate(h.latitude, h.longitude);
    return {
      id: h.id,
      sheetNo: h.sheet.sheetNo,
      communityTh: h.community.nameTh,
      houseNo: h.houseNo,
      mooNo: h.mooNo != null && h.mooNo > 0 ? h.mooNo : null,
      lat: point?.lat ?? null,
      lng: point?.lng ?? null,
      source: {
        floorLevelVsRoad: p?.floorLevelVsRoad ?? null,
        hasFloodedBefore: p?.hasFloodedBefore ?? null,
        maxFloodDepthCm: p ? calculateFloodDepthCm(p.floodDepthMetersRaw, p.floodDepthCmRaw) ?? p.maxFloodDepthCm : null,
        lastFloodDurationDays: p?.lastFloodDurationDays ?? null,
        hasSurvivalKit: p?.hasSurvivalKit ?? null,
        nearestEvacSiteType: p?.nearestEvacSiteType ?? null,
      },
      persons: h.vulnerablePersons.map((v) => ({
        stored: v.triageLevel as TriageCode | null,
        typeCodes: v.vulnerabilities.map((item) => item.vulnerabilityType.code),
      })),
    };
  });
}
