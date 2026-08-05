// =============================================================================
// Risk Model — Household → Factor mapping (Pure)
// -----------------------------------------------------------------------------
// แปลงข้อมูลครัวเรือนจริง (รูปทรงเรียบ ไม่ผูก Prisma) เป็น FactorInput ให้ engine
// ทดสอบได้โดยไม่พึ่ง DB (tests/unit/risk-factors.test.ts)
//
// กติกาการแปลง (ตาม RISK-04 ในเอกสาร 08):
//  - ค่า null = ไม่มีในกระดาษ (BLANK) → ไม่นับ (ตัดออก ไม่สร้างความเสี่ยงปลอม)
//  - boolean false = คำตอบจริง (เช่น "ไม่ได้เตรียมถุงยังชีพ") → นับเป็นความเสี่ยง
//  - ปัจจัย 4 ตัว (NO_VEHICLE/NO_RESOURCES/NO_DIGITAL_CHANNEL/FAR_FROM_EVAC) ยัง
//    แยก "ไม่มีจริง" จาก "ไม่ได้ถาม" ไม่ได้ (กระดาษไม่มีช่อง / ต้องใช้ GIS ที่ยังไม่มี)
//    → จงใจไม่ปล่อยออกมา = ถือเป็น BLANK ทั้งหมด (ปลอดภัยกว่า) จนกว่าแก้กระดาษ/มี GIS
//
// ⚠️ เกณฑ์ normalize (100cm, 7วัน) เป็น draft — ต้องรับรองเช่นกัน (docs/29)
//
// หมายเหตุ verified: flow ปัจจุบันเป็น Single-Entry + Verifier ตรวจทั้งใบ (ไม่มี
// double-entry รายฟิลด์) เราคำนวณ Risk เฉพาะครัวเรือน VERIFIED เท่านั้น จึงถือว่า
// ปัจจัยที่มีข้อมูล "ผ่านการตรวจแล้ว" (verified=true) — confidence จึงสะท้อน
// "ความครบของข้อมูล" เป็นหลัก
// =============================================================================

import type { FactorInput } from "./score";
import type { RiskComputationInput } from "./score";

/** เพดาน normalize (draft — รอรับรอง) */
export const FLOOD_DEPTH_FULL_CM = 100; // น้ำลึก ≥ 1 เมตร = เสี่ยงเต็ม
export const FLOOD_DURATION_FULL_DAYS = 7; // ท่วมนาน ≥ 1 สัปดาห์ = เสี่ยงเต็ม

/** รูปทรงข้อมูลครัวเรือนที่ใช้คำนวณ (แบน ไม่ผูก Prisma) */
export interface HouseholdRiskSource {
  floorLevelVsRoad: "BELOW_ROAD" | "EQUAL_ROAD" | "ABOVE_ROAD" | null;
  hasFloodedBefore: boolean | null;
  maxFloodDepthCm: number | null;
  lastFloodDurationDays: number | null;
  hasSurvivalKit: boolean | null;
  nearestEvacSiteType: string | null; // "UNKNOWN" | ... | null
  /** triageLevel ของสมาชิกกลุ่มเปราะบางที่ยัง active (ใช้ derive HAS_P1/HAS_P2) */
  vulnerableTriages: string[]; // ("P1" | "P2" | "P3")[]
  /** โค้ดชนิดความเปราะบางที่ยัง active (ใช้ Hard Rules) */
  vulnerabilityCodes: string[]; // เช่น ["BEDRIDDEN", "DIALYSIS"]
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** สร้าง FactorInput เมื่อ "มีข้อมูล" — ครัวเรือน VERIFIED จึงถือว่า verified */
function has(code: FactorInput["code"], value: number): FactorInput {
  return { code, value: clamp01(value), status: "HAS_VALUE", verified: true };
}

/**
 * แปลงครัวเรือนหนึ่งเป็นอินพุตของ engine — Pure Function
 * ปัจจัยที่ข้อมูลเป็น null จะถูก "ไม่ปล่อยออกมา" = engine ตีความเป็น BLANK
 */
export function householdToRiskInput(src: HouseholdRiskSource): RiskComputationInput {
  const factors: FactorInput[] = [];

  // FLOOR_LEVEL — ต่ำกว่าถนน = เสี่ยงเต็ม, เท่าถนน = ครึ่ง, สูงกว่า = ไม่เสี่ยง
  if (src.floorLevelVsRoad !== null) {
    const v =
      src.floorLevelVsRoad === "BELOW_ROAD"
        ? 1
        : src.floorLevelVsRoad === "EQUAL_ROAD"
          ? 0.5
          : 0;
    factors.push(has("FLOOR_LEVEL", v));
  }

  // HAS_FLOODED — เคยท่วม = เสี่ยง
  if (src.hasFloodedBefore !== null) {
    factors.push(has("HAS_FLOODED", src.hasFloodedBefore ? 1 : 0));
  }

  // FLOOD_DEPTH — normalize จากซม. (draft: ≥100cm = เต็ม)
  if (src.maxFloodDepthCm !== null) {
    factors.push(has("FLOOD_DEPTH", src.maxFloodDepthCm / FLOOD_DEPTH_FULL_CM));
  }

  // FLOOD_DURATION — normalize จากวัน (draft: ≥7วัน = เต็ม)
  if (src.lastFloodDurationDays !== null) {
    factors.push(
      has("FLOOD_DURATION", src.lastFloodDurationDays / FLOOD_DURATION_FULL_DAYS),
    );
  }

  // HAS_P1 / HAS_P2 — derived จากกลุ่มเปราะบาง (ตารางนี้เป็นส่วนหนึ่งของการสำรวจ
  // จึงถือว่ามีข้อมูลเสมอ: ไม่มีสมาชิก P1 = ยืนยันว่าไม่มี → value 0)
  factors.push(has("HAS_P1", src.vulnerableTriages.includes("P1") ? 1 : 0));
  factors.push(has("HAS_P2", src.vulnerableTriages.includes("P2") ? 1 : 0));

  // NO_SURVIVAL_KIT — ไม่ได้เตรียม = เสี่ยง (false = เสี่ยง, true = ไม่เสี่ยง)
  if (src.hasSurvivalKit !== null) {
    factors.push(has("NO_SURVIVAL_KIT", src.hasSurvivalKit ? 0 : 1));
  }

  // UNKNOWN_EVAC_SITE — ไม่รู้จุดอพยพ = เสี่ยง
  if (src.nearestEvacSiteType !== null) {
    factors.push(
      has("UNKNOWN_EVAC_SITE", src.nearestEvacSiteType === "UNKNOWN" ? 1 : 0),
    );
  }

  // NO_VEHICLE / NO_RESOURCES / NO_DIGITAL_CHANNEL / FAR_FROM_EVAC → BLANK (ไม่ปล่อย)

  return {
    factors,
    hasBedridden: src.vulnerabilityCodes.includes("BEDRIDDEN"),
    hasDialysis: src.vulnerabilityCodes.includes("DIALYSIS"),
  };
}
