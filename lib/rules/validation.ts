import { z } from "zod";
import type { FactorCode, RiskWeightConfig } from "../../domain/risk/weights";

// กฎการจัดลำดับ (docs/40) — ใช้ร่วมกันทั้ง client (ฟอร์มแก้กฎ) และ server (บันทึก/อ่านจาก DB)

const RISK_LEVEL = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const TRIAGE = z.enum(["P1", "P2", "P3"]);
const FACTOR_CODES = [
  "FLOOR_LEVEL", "HAS_FLOODED", "FLOOD_DEPTH", "FLOOD_DURATION", "HAS_P1", "HAS_P2",
  "NO_VEHICLE", "NO_SURVIVAL_KIT", "NO_RESOURCES", "UNKNOWN_EVAC_SITE", "NO_DIGITAL_CHANNEL", "FAR_FROM_EVAC",
] as const satisfies readonly FactorCode[];
const FACTOR_CODE = z.enum(FACTOR_CODES);
const CODE = z.string().regex(/^[A-Z0-9_]{1,40}$/, "รหัสไม่ถูกต้อง");

/** น้ำหนักต่อปัจจัย — 0 = ไม่นับปัจจัยนี้ · ทีละ 0.5 เพื่อให้อ่านง่ายบนหน้ากฎ */
const weightSchema = z
  .number({ error: "กรอกน้ำหนักเป็นตัวเลข" })
  .min(0, "น้ำหนักต้องไม่ติดลบ")
  .max(100, "น้ำหนักต่อปัจจัยไม่เกิน 100")
  .refine((v) => Number.isInteger(v * 2), "น้ำหนักใช้ทีละ 0.5");

const thresholdSchema = z
  .number({ error: "กรอกเกณฑ์เป็นตัวเลข" })
  .gt(0, "เกณฑ์ต้องมากกว่า 0")
  .lt(100, "เกณฑ์ต้องน้อยกว่า 100");

const ruleEditBase = z.object({
  /** เวอร์ชันที่ผู้แก้เห็นตอนเปิดหน้า — ไม่ตรงกับปัจจุบัน = มีคนบันทึกก่อน (CONFLICT) */
  baseVersionNo: z.number().int().min(0),
  weights: z.record(FACTOR_CODE, weightSchema),
  thresholds: z.object({ LOW: thresholdSchema, MEDIUM: thresholdSchema, HIGH: thresholdSchema }),
  minConfidence: z.number().min(0, "ต่ำสุด 0%").max(1, "สูงสุด 100%"),
  hardRules: z.record(CODE, RISK_LEVEL),
  triage: z.record(CODE, TRIAGE),
  approved: z.boolean(),
  reason: z.string().trim().min(5, "ระบุเหตุผลอย่างน้อย 5 ตัวอักษร").max(500, "เหตุผลยาวเกินไป"),
});

function checkRuleConsistency(
  value: { thresholds: { LOW: number; MEDIUM: number; HIGH: number }; weights: Record<string, number> },
  ctx: z.RefinementCtx,
) {
  const t = value.thresholds;
  if (!(t.LOW < t.MEDIUM && t.MEDIUM < t.HIGH)) {
    ctx.addIssue({ code: "custom", path: ["thresholds"], message: "เกณฑ์ต้องเรียงจากน้อยไปมาก: ต่ำ < ปานกลาง < สูง < 100" });
  }
  const total = Object.values(value.weights).reduce((sum, w) => sum + w, 0);
  if (total <= 0) ctx.addIssue({ code: "custom", path: ["weights"], message: "น้ำหนักรวมต้องมากกว่า 0" });
}

/** ค่าที่แอดมินส่งมาบันทึก — ตรวจซ้ำที่ server เสมอ (ห้ามเชื่อ client) */
export const ruleEditSchema = ruleEditBase.superRefine(checkRuleConsistency);

export type RuleEditInput = z.infer<typeof ruleEditSchema>;

/** ค่าที่ใช้ดูตัวอย่างผลกระทบ — เหมือนบันทึกแต่ไม่บังคับเหตุผล */
export const rulePreviewSchema = ruleEditBase
  .extend({ reason: z.string().max(500).optional() })
  .superRefine(checkRuleConsistency);

/** โครง RiskWeightConfig ที่เก็บใน priority_rule_version.riskConfig — อ่านแล้วตรวจก่อนใช้ */
export const storedRiskConfigSchema = z.object({
  formulaVersion: z.string().min(1),
  weightVersion: z.string().min(1),
  draft: z.boolean(),
  factors: z
    .array(
      z.object({
        code: FACTOR_CODE,
        nameTh: z.string(),
        weight: z.number().min(0).max(100),
        source: z.string(),
        requiresGis: z.boolean().optional(),
      }),
    )
    .min(1),
  thresholds: z.array(z.object({ level: RISK_LEVEL, maxInclusive: z.number() })).length(4),
  confidenceBase: z.number().min(0).max(1),
  confidenceVerificationBonus: z.number().min(0).max(1),
  minConfidence: z.number().min(0).max(1),
  hardRules: z.array(
    z.object({
      code: z.string(),
      nameTh: z.string(),
      when: z.enum(["hasBedridden", "hasDialysis"]),
      minLevel: RISK_LEVEL,
    }),
  ),
}) satisfies z.ZodType<RiskWeightConfig>;

export const storedTriageMapSchema = z.record(CODE, TRIAGE);
