// =============================================================================
// กฎการจัดลำดับ (Owner Decision 2026-10-19 · docs/40) — Pure Functions
// -----------------------------------------------------------------------------
// "กฎ" มีสองชุดที่ต้องเห็นพร้อมกัน:
//  1. ความเร่งด่วนรายบุคคล — ประเภทความเปราะบาง → P1/P2/P3 (ค่าจริงอยู่ที่ VulnerabilityType.basePriority)
//  2. ความเสี่ยงครัวเรือน — RiskWeightConfig (น้ำหนัก/เกณฑ์/ความมั่นใจ/กฎบังคับ) ของ domain/risk
// ไฟล์นี้ไม่แตะ DB — แปลงค่าที่แอดมินแก้ (RuleEditValues) เป็น config ชุดใหม่ และสรุป old → new
// =============================================================================

import type { TriageCode } from "../triage";
import type { FactorCode, RiskLevel, RiskWeightConfig } from "../risk/weights";

/** ประเภทความเปราะบาง → ระดับความเร่งด่วน (รหัส VulnerabilityType.code) */
export type TriageMap = Record<string, TriageCode>;

/** ระยะเวลาที่ควรเข้าช่วยเหลือของแต่ละระดับ (Owner Decision — แสดงเป็นข้อมูล ไม่ได้ใช้คำนวณ) */
export const TRIAGE_RESPONSE_TIME: Record<TriageCode, string> = {
  P1: "ภายใน 30 นาที",
  P2: "ภายใน 2 ชั่วโมง",
  P3: "ภายใน 6 ชั่วโมง",
};

export const RISK_LEVEL_LABEL: Record<RiskLevel, string> = {
  LOW: "ต่ำ",
  MEDIUM: "ปานกลาง",
  HIGH: "สูง",
  CRITICAL: "สูงมาก",
};

export const RISK_LEVELS: readonly RiskLevel[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/** ชุดกฎที่ใช้งานอยู่ — risk มาจากเวอร์ชันล่าสุด · triage มาจากตาราง VulnerabilityType */
export interface ActiveRuleSet {
  /** 0 = ยังไม่มีเวอร์ชันใน DB (ใช้ค่าร่างในโค้ด) */
  versionNo: number;
  isDraft: boolean;
  risk: RiskWeightConfig;
  triage: TriageMap;
  createdAt: string | null;
  createdByName: string | null;
  reason: string | null;
}

/** ค่าที่แอดมินแก้ได้ — โครงเดียวกับ Zod schema ใน lib/rules/validation.ts */
export interface RuleEditValues {
  weights: Partial<Record<FactorCode, number>>;
  /** ขอบบนของ LOW / MEDIUM / HIGH (CRITICAL = 100 เสมอ) */
  thresholds: { LOW: number; MEDIUM: number; HIGH: number };
  /** 0..1 */
  minConfidence: number;
  /** รหัสกฎบังคับ → ระดับขั้นต่ำ */
  hardRules: Record<string, RiskLevel>;
  triage: TriageMap;
  /** true = เจ้าของระบบรับรองแล้ว (ป้าย "ร่าง" หายไป) */
  approved: boolean;
}

/** ป้ายเวอร์ชันน้ำหนักที่โชว์ในหน้า /risk และบันทึกในผลคำนวณ */
export function weightVersionLabel(versionNo: number, isDraft: boolean): string {
  return `${versionNo}.0${isDraft ? "-draft" : ""}`;
}

/** สร้าง RiskWeightConfig ชุดใหม่จากชุดเดิม + ค่าที่แก้ (ปัจจัย/กฎบังคับใหม่เพิ่มไม่ได้ — ผูกกับโค้ดแปลงข้อมูล) */
export function applyRiskEdit(
  current: RiskWeightConfig,
  edit: Pick<RuleEditValues, "weights" | "thresholds" | "minConfidence" | "hardRules" | "approved">,
  versionNo: number,
): RiskWeightConfig {
  const isDraft = !edit.approved;
  return {
    ...current,
    weightVersion: weightVersionLabel(versionNo, isDraft),
    draft: isDraft,
    factors: current.factors.map((f) => ({ ...f, weight: edit.weights[f.code] ?? f.weight })),
    thresholds: [
      { level: "LOW", maxInclusive: edit.thresholds.LOW },
      { level: "MEDIUM", maxInclusive: edit.thresholds.MEDIUM },
      { level: "HIGH", maxInclusive: edit.thresholds.HIGH },
      { level: "CRITICAL", maxInclusive: 100 },
    ],
    minConfidence: edit.minConfidence,
    hardRules: current.hardRules.map((r) => ({ ...r, minLevel: edit.hardRules[r.code] ?? r.minLevel })),
  };
}

/** ค่าปัจจุบันในรูปแบบฟอร์ม — ใช้ตั้งต้นตัวแก้ไข */
export function toEditValues(rules: ActiveRuleSet): RuleEditValues {
  const threshold = (level: RiskLevel) =>
    rules.risk.thresholds.find((t) => t.level === level)?.maxInclusive ?? 100;
  return {
    weights: Object.fromEntries(rules.risk.factors.map((f) => [f.code, f.weight])),
    thresholds: { LOW: threshold("LOW"), MEDIUM: threshold("MEDIUM"), HIGH: threshold("HIGH") },
    minConfidence: rules.risk.minConfidence,
    hardRules: Object.fromEntries(rules.risk.hardRules.map((r) => [r.code, r.minLevel])),
    triage: { ...rules.triage },
    approved: !rules.isDraft,
  };
}

export type RuleChange = { field: string; old: string | number | boolean; new: string | number | boolean };

const TRIAGE_WORD: Record<TriageCode, string> = { P1: "วิกฤต", P2: "เร่งด่วน", P3: "เฝ้าระวัง" };

/** อธิบายรายการที่เปลี่ยนเป็นภาษาไทย เช่น "น้ำหนัก ระดับพื้นเทียบถนน: 20 → 25" (ไม่ใช้รหัส P1–P3) */
export function describeRuleChange(
  change: RuleChange,
  names: { factors: Record<string, string>; hardRules: Record<string, string>; types: Record<string, string> },
): string {
  const [kind, code] = change.field.split(".");
  const level = (v: RuleChange["old"]) => (typeof v === "string" && v in RISK_LEVEL_LABEL ? RISK_LEVEL_LABEL[v as RiskLevel] : String(v));
  const triage = (v: RuleChange["old"]) => (typeof v === "string" && v in TRIAGE_WORD ? TRIAGE_WORD[v as TriageCode] : String(v));
  switch (kind) {
    case "weight":
      return `น้ำหนัก ${names.factors[code] ?? code}: ${change.old} → ${change.new}`;
    case "threshold":
      return `เกณฑ์ระดับ${level(code)} (คะแนนไม่เกิน): ${change.old} → ${change.new}`;
    case "minConfidence":
      return `ความมั่นใจขั้นต่ำ: ${Math.round(Number(change.old) * 100)}% → ${Math.round(Number(change.new) * 100)}%`;
    case "hardRule":
      return `${names.hardRules[code] ?? code}: อย่างน้อย${level(change.old)} → อย่างน้อย${level(change.new)}`;
    case "triage":
      return `${names.types[code] ?? code}: ${triage(change.old)} → ${triage(change.new)}`;
    case "isDraft":
      return change.new ? "สถานะ: รับรองแล้ว → ร่าง" : "สถานะ: ร่าง → รับรองแล้ว";
    default:
      return `${change.field}: ${change.old} → ${change.new}`;
  }
}

/** รายการที่เปลี่ยน old → new (ไม่มี PII — เป็นค่ากฎล้วน) ใช้ทั้ง Audit Log และหน้าจอยืนยัน */
export function diffRules(
  before: { risk: RiskWeightConfig; triage: TriageMap; isDraft: boolean },
  after: { risk: RiskWeightConfig; triage: TriageMap; isDraft: boolean },
): RuleChange[] {
  const changes: RuleChange[] = [];
  for (const f of after.risk.factors) {
    const old = before.risk.factors.find((b) => b.code === f.code)?.weight;
    if (old !== undefined && old !== f.weight) changes.push({ field: `weight.${f.code}`, old, new: f.weight });
  }
  for (const t of after.risk.thresholds) {
    const old = before.risk.thresholds.find((b) => b.level === t.level)?.maxInclusive;
    if (old !== undefined && old !== t.maxInclusive) changes.push({ field: `threshold.${t.level}`, old, new: t.maxInclusive });
  }
  if (before.risk.minConfidence !== after.risk.minConfidence) {
    changes.push({ field: "minConfidence", old: before.risk.minConfidence, new: after.risk.minConfidence });
  }
  for (const r of after.risk.hardRules) {
    const old = before.risk.hardRules.find((b) => b.code === r.code)?.minLevel;
    if (old !== undefined && old !== r.minLevel) changes.push({ field: `hardRule.${r.code}`, old, new: r.minLevel });
  }
  for (const [code, level] of Object.entries(after.triage)) {
    const old = before.triage[code];
    if (old !== undefined && old !== level) changes.push({ field: `triage.${code}`, old, new: level });
  }
  if (before.isDraft !== after.isDraft) changes.push({ field: "isDraft", old: before.isDraft, new: after.isDraft });
  return changes;
}
