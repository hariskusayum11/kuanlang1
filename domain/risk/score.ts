// =============================================================================
// Risk Model — Scoring Engine (Pure Functions)
// -----------------------------------------------------------------------------
// ตรรกะการคำนวณความเสี่ยงล้วน ๆ — ไม่มี DOM / React / Prisma / I/O
// รับ "ปัจจัยที่แปลงแล้ว" + config แล้วคืนคะแนน/ความมั่นใจ/ระดับ
// (tests/unit/risk-score.test.ts) · ออกแบบตาม docs/08-risk-model-review.md
//
// หลักการสำคัญ 3 ข้อที่ฝังในสูตร:
//  1. ข้อมูลขาด → ลด "ความมั่นใจ" ไม่ใช่ "ดันคะแนนพุ่ง" (จัดระดับด้วย absoluteScore
//     ตัวหารคงที่ = น้ำหนักรวมทั้งระบบ ไม่ใช่ normalizedScore ตัวหารลอย)
//  2. BLANK/ILLEGIBLE = ไม่มีข้อมูล (ตัดออก) · EXPLICIT_NONE = ข้อมูล (เป็นความเสี่ยงได้)
//  3. Confidence ถ่วงน้ำหนัก — รู้ปัจจัยหนักย่อมมั่นใจกว่ารู้ปัจจัยเบาหลายตัว
// =============================================================================

import {
  type FactorCode,
  type RiskLevel,
  type RiskWeightConfig,
  RISK_LEVEL_ORDER,
  totalSystemWeight,
} from "./weights";

/** สถานะฟิลด์ตามกระดาษ (mirror ของ Field Status Model T10) */
export type FieldStatus = "HAS_VALUE" | "EXPLICIT_NONE" | "BLANK_IN_PAPER" | "ILLEGIBLE";

/** ปัจจัยหนึ่งตัวที่แปลงพร้อมคำนวณแล้ว */
export interface FactorInput {
  code: FactorCode;
  /** ระดับความเสี่ยงของปัจจัยนี้ 0..1 (1 = เสี่ยงเต็ม) ใช้เมื่อ status นับเป็นข้อมูล */
  value: number;
  status: FieldStatus;
  /** ผ่านการตรวจสอบซ้ำ (double-entry) — มีผลต่อ verificationLevel เท่านั้น */
  verified?: boolean;
}

/** อินพุตของการคำนวณ 1 ครัวเรือน */
export interface RiskComputationInput {
  factors: FactorInput[];
  /** ธงสำหรับ Hard Rules (มาจากข้อมูลกลุ่มเปราะบางที่ยืนยันแล้ว) */
  hasBedridden?: boolean;
  hasDialysis?: boolean;
}

export interface RiskComputationResult {
  rawScore: number;
  /** Σ(weight ของปัจจัยที่มีข้อมูล) */
  maximumPossibleScore: number;
  totalSystemWeight: number;
  /** rawScore / maxPossible × 100 — "เท่าที่รู้ เสี่ยงกี่ %" · null เมื่อไม่มีข้อมูลเลย */
  normalizedScore: number | null;
  /** ⭐ rawScore / totalSystemWeight × 100 — ใช้จัดระดับ (ตัวหารคงที่ เทียบข้ามบ้านได้) */
  absoluteScore: number;
  dataCompleteness: number;
  verificationLevel: number;
  riskConfidence: number;
  factorsUsed: number;
  factorsTotal: number;
  /** null = confidence ต่ำกว่าเกณฑ์ → "ข้อมูลไม่พอประเมิน" (เว้นแต่ถูก Hard Rule ยกพื้น) */
  riskLevelAuto: RiskLevel | null;
  appliedHardRules: string[];
  formulaVersion: string;
  weightVersion: string;
}

/** บีบค่าเข้าช่วง 0..1 · ค่าเพี้ยน (NaN/Infinity) → 0 (เลือกพลาดไปทางน้อยกว่าเสมอ) */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** ปัจจัยนับเป็น "มีข้อมูล" เมื่อมีค่าจริง หรือยืนยันว่า "ไม่มี" — BLANK/ILLEGIBLE ไม่นับ */
export function isAvailable(status: FieldStatus): boolean {
  return status === "HAS_VALUE" || status === "EXPLICIT_NONE";
}

/**
 * จัดระดับจาก absoluteScore ด้วยเกณฑ์ half-open — คืนระดับแรกที่ score <= maxInclusive
 * ถ้าเกินทุกขอบ (ไม่ควรเกิดถ้า config ตัวสุดท้าย = 100) → คืนระดับสูงสุดที่นิยามไว้
 */
export function classifyLevel(
  absoluteScore: number,
  config: RiskWeightConfig,
): RiskLevel {
  for (const t of config.thresholds) {
    if (absoluteScore <= t.maxInclusive) return t.level;
  }
  return config.thresholds[config.thresholds.length - 1].level;
}

/** คืนระดับที่รุนแรงกว่าระหว่างสองค่า (a อาจเป็น null = ยังไม่มีระดับ) */
function maxLevel(a: RiskLevel | null, b: RiskLevel): RiskLevel {
  if (a === null) return b;
  return RISK_LEVEL_ORDER[a] >= RISK_LEVEL_ORDER[b] ? a : b;
}

/**
 * คำนวณความเสี่ยงของครัวเรือนหนึ่ง — Pure Function
 *
 * ลำดับ: รวมคะแนนเฉพาะปัจจัยที่มีข้อมูล → absoluteScore → confidence 3 มิติ →
 * จัดระดับถ้า confidence ผ่านเกณฑ์ → Hard Rules ยกพื้นระดับ (ทับผลคำนวณ)
 */
export function computeRisk(
  input: RiskComputationInput,
  config: RiskWeightConfig,
): RiskComputationResult {
  const systemWeight = totalSystemWeight(config);
  const byCode = new Map<FactorCode, FactorInput>();
  for (const f of input.factors) byCode.set(f.code, f);

  let rawScore = 0;
  let availableWeight = 0;
  let verifiedWeight = 0;
  let factorsUsed = 0;

  // วนตาม config (แหล่งความจริงของปัจจัย) — ปัจจัยที่ไม่ได้ส่งมา = BLANK (ไม่นับ)
  for (const fw of config.factors) {
    const f = byCode.get(fw.code);
    if (!f || !isAvailable(f.status)) continue;
    rawScore += clamp01(f.value) * fw.weight;
    availableWeight += fw.weight;
    if (f.verified) verifiedWeight += fw.weight;
    factorsUsed += 1;
  }

  const normalizedScore =
    availableWeight > 0 ? (rawScore / availableWeight) * 100 : null;
  const absoluteScore =
    systemWeight > 0 ? (rawScore / systemWeight) * 100 : 0;

  const dataCompleteness = systemWeight > 0 ? availableWeight / systemWeight : 0;
  const verificationLevel =
    availableWeight > 0 ? verifiedWeight / availableWeight : 0;
  const riskConfidence =
    dataCompleteness *
    (config.confidenceBase + config.confidenceVerificationBonus * verificationLevel);

  // จัดระดับเฉพาะเมื่อมั่นใจพอ — ไม่งั้นปล่อย null ("ข้อมูลไม่พอประเมิน")
  let riskLevelAuto: RiskLevel | null =
    riskConfidence >= config.minConfidence ? classifyLevel(absoluteScore, config) : null;

  // Hard Rules ทับผลคำนวณ — เงื่อนไขที่ trigger เป็นข้อมูลที่ "รู้แน่" (ติดเตียง/ฟอกไต)
  // จึงยกพื้นระดับได้แม้ confidence รวมจะต่ำ (ปลอดภัยกว่าการซ่อนบ้านที่มีผู้ป่วยติดเตียง)
  const appliedHardRules: string[] = [];
  for (const rule of config.hardRules) {
    if (input[rule.when]) {
      riskLevelAuto = maxLevel(riskLevelAuto, rule.minLevel);
      appliedHardRules.push(rule.code);
    }
  }

  return {
    rawScore,
    maximumPossibleScore: availableWeight,
    totalSystemWeight: systemWeight,
    normalizedScore,
    absoluteScore,
    dataCompleteness,
    verificationLevel,
    riskConfidence,
    factorsUsed,
    factorsTotal: config.factors.length,
    riskLevelAuto,
    appliedHardRules,
    formulaVersion: config.formulaVersion,
    weightVersion: config.weightVersion,
  };
}
