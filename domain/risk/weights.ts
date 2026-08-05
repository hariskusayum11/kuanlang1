// =============================================================================
// Risk Model — Weight & Threshold Config (v1.0-draft)
// -----------------------------------------------------------------------------
// นิยาม "ข้อมูล" ของโมเดลความเสี่ยง (น้ำหนัก / เกณฑ์ / พารามิเตอร์ confidence)
// แยกออกจาก "ตรรกะ" (score.ts) เพื่อให้ปรับค่าได้โดยไม่แตะสูตร และสลับ version ได้
//
// ⚠️ ค่าทั้งหมดในไฟล์นี้เป็น v1.0-DRAFT — ยังไม่ได้รับการรับรองจากเจ้าของระบบ
//    (ดู docs/29-risk-values-for-approval.md) น้ำหนัก 115 / threshold 25·50·75 /
//    สัดส่วน confidence 0.7·0.3 "ไม่มีที่มา" ต้อง sign-off ก่อนใช้จริง
//    เมื่อรับรองแล้วค่านี้จะถูกย้ายไปเก็บใน DB (RiskWeightVersion) และ seed จากที่นี่
// =============================================================================

/** รหัสปัจจัยความเสี่ยง 12 ตัว (mirror ของ factorCode ที่จะ seed ลง DB) */
export type FactorCode =
  | "FLOOR_LEVEL"
  | "HAS_FLOODED"
  | "FLOOD_DEPTH"
  | "FLOOD_DURATION"
  | "HAS_P1"
  | "HAS_P2"
  | "NO_VEHICLE"
  | "NO_SURVIVAL_KIT"
  | "NO_RESOURCES"
  | "UNKNOWN_EVAC_SITE"
  | "NO_DIGITAL_CHANNEL"
  | "FAR_FROM_EVAC";

/**
 * ระดับความเสี่ยง — mirror ของ Prisma enum `RiskLevel` (string ตรงกันทุกค่า)
 * ตั้งใจไม่ import จาก @prisma/client เพื่อให้ domain เป็น pure ทดสอบได้โดยไม่พึ่ง client
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** ลำดับความรุนแรง — ใช้เทียบ/หา max เมื่อ Hard Rule ยกระดับ */
export const RISK_LEVEL_ORDER: Record<RiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export interface FactorWeight {
  code: FactorCode;
  nameTh: string;
  weight: number;
  /** ที่มาจากกระดาษ (ตรวจสอบย้อนหลังได้) */
  source: string;
  /** true = ต้องใช้ข้อมูล GIS (EvacuationSite) ซึ่งยังไม่มีในระบบ → ช่วงแรกจะขาดทุกครัวเรือน */
  requiresGis?: boolean;
}

/**
 * เกณฑ์แบ่งระดับแบบ half-open — ปิดช่องว่างไม่ให้ค่า 25.5 ตกช่อง
 * ตีความ: level = ระดับแรกที่ absoluteScore <= maxInclusive
 * เรียงจากน้อยไปมาก ตัวสุดท้ายต้องครอบ 100
 */
export interface RiskThreshold {
  level: RiskLevel;
  /** ขอบบนแบบรวม (score <= ค่านี้ → ระดับนี้) */
  maxInclusive: number;
}

/** กฎบังคับที่ทับผลการคำนวณ — "ยกพื้น" ระดับความเสี่ยงขั้นต่ำเมื่อเงื่อนไขเป็นจริง */
export interface HardRule {
  code: string;
  nameTh: string;
  /** ธงเงื่อนไขใน RiskComputationInput ที่ทำให้กฎนี้ทำงาน */
  when: "hasBedridden" | "hasDialysis";
  /** ยกระดับความเสี่ยงขั้นต่ำเป็นอย่างน้อยระดับนี้ */
  minLevel: RiskLevel;
}

export interface RiskWeightConfig {
  formulaVersion: string;
  weightVersion: string;
  /** true = ค่ายังไม่ได้รับการรับรอง (แสดงป้ายเตือนบน UI) */
  draft: boolean;
  factors: FactorWeight[];
  thresholds: RiskThreshold[];
  /** ฐานของสูตร confidence: dataCompleteness × (base + bonus × verificationLevel) */
  confidenceBase: number;
  confidenceVerificationBonus: number;
  /** ต่ำกว่านี้ → ไม่แสดงระดับ ("ข้อมูลไม่พอประเมิน") */
  minConfidence: number;
  hardRules: HardRule[];
}

// ── ค่าที่เสนอ (v1.0-draft) — ดึงจาก docs/08-risk-model-review.md ─────────────

export const DRAFT_RISK_CONFIG_V1: RiskWeightConfig = {
  formulaVersion: "1.0",
  weightVersion: "1.0-draft",
  draft: true,
  factors: [
    { code: "FLOOR_LEVEL", nameTh: "ระดับพื้นเทียบถนน", weight: 20, source: "ส่วน 3 ข้อ 1" },
    { code: "HAS_FLOODED", nameTh: "ประวัติน้ำท่วม", weight: 15, source: "ส่วน 3 ข้อ 2" },
    { code: "FLOOD_DEPTH", nameTh: "ระดับน้ำสูงสุด", weight: 15, source: "ส่วน 3 ข้อ 3" },
    { code: "FLOOD_DURATION", nameTh: "ระยะเวลาน้ำท่วม", weight: 5, source: "ส่วน 3 ข้อ 4" },
    { code: "HAS_P1", nameTh: "มีกลุ่มเปราะบาง P1", weight: 20, source: "ส่วน 2 (derived)" },
    { code: "HAS_P2", nameTh: "มีกลุ่มเปราะบาง P2", weight: 10, source: "ส่วน 2 (derived)" },
    { code: "NO_VEHICLE", nameTh: "ไม่มีพาหนะอพยพ", weight: 8, source: "ส่วน 3 ข้อ 9" },
    { code: "NO_SURVIVAL_KIT", nameTh: "ไม่มีถุงยังชีพ", weight: 4, source: "ส่วน 3 ข้อ 10" },
    { code: "NO_RESOURCES", nameTh: "ไม่มีทรัพยากรรับมือ", weight: 3, source: "ส่วน 3 ข้อ 11" },
    { code: "UNKNOWN_EVAC_SITE", nameTh: "ไม่รู้จุดอพยพ", weight: 5, source: "ส่วน 3 ข้อ 8" },
    { code: "NO_DIGITAL_CHANNEL", nameTh: "ไม่มีช่องทางรับข่าวดิจิทัล", weight: 4, source: "ส่วน 4 ข้อ 1" },
    { code: "FAR_FROM_EVAC", nameTh: "ระยะห่างจุดอพยพ >1 กม.", weight: 6, source: "คำนวณจาก GIS", requiresGis: true },
  ],
  thresholds: [
    { level: "LOW", maxInclusive: 25 },
    { level: "MEDIUM", maxInclusive: 50 },
    { level: "HIGH", maxInclusive: 75 },
    { level: "CRITICAL", maxInclusive: 100 },
  ],
  confidenceBase: 0.7,
  confidenceVerificationBonus: 0.3,
  minConfidence: 0.6,
  hardRules: [
    { code: "BEDRIDDEN_MIN_HIGH", nameTh: "ผู้ป่วยติดเตียง → ความเสี่ยง ≥ สูง", when: "hasBedridden", minLevel: "HIGH" },
    { code: "DIALYSIS_MIN_HIGH", nameTh: "ผู้ป่วยฟอกไต → ความเสี่ยง ≥ สูง", when: "hasDialysis", minLevel: "HIGH" },
  ],
};

/** ผลรวมน้ำหนักทั้งระบบ (ตัวหารคงที่ของ absoluteScore) — ไม่ hardcode 115 */
export function totalSystemWeight(config: RiskWeightConfig): number {
  return config.factors.reduce((sum, f) => sum + f.weight, 0);
}
