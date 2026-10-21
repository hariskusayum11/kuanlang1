import { describe, it, expect } from "vitest";
import { DRAFT_RISK_CONFIG_V1, totalSystemWeight } from "../../domain/risk/weights";
import {
  applyRiskEdit,
  describeRuleChange,
  diffRules,
  factorLabel,
  factorSource,
  toEditValues,
  weightVersionLabel,
  type ActiveRuleSet,
  type TriageMap,
} from "../../domain/rules/priority-rules";
import {
  computeRuleImpact,
  evaluateHousehold,
  personTriage,
  storedTriageAfterMapChange,
  type RuleHousehold,
} from "../../domain/rules/impact";
import { compareHelpPriority, rankHelpCases, type HelpCandidate } from "../../domain/geo/help-priority";
import { ruleEditSchema, rulePreviewSchema, storedRiskConfigSchema } from "../../lib/rules/validation";

// กฎการจัดลำดับแบบมีเวอร์ชัน (docs/40) — Pure Functions

const MAP: TriageMap = {
  BEDRIDDEN: "P1",
  DIALYSIS: "P1",
  ELDERLY_DEPENDENT: "P2",
  PREGNANT: "P2",
  CHILD_UNDER_5: "P3",
  OTHER: "P3",
};

const ACTIVE: ActiveRuleSet = {
  versionNo: 1,
  isDraft: true,
  risk: DRAFT_RISK_CONFIG_V1,
  triage: MAP,
  createdAt: null,
  createdByName: null,
  reason: null,
};

const BLANK_SOURCE: RuleHousehold["source"] = {
  floorLevelVsRoad: null,
  hasFloodedBefore: null,
  maxFloodDepthCm: null,
  lastFloodDurationDays: null,
  hasSurvivalKit: null,
  nearestEvacSiteType: null,
};

const FULL_RISK_SOURCE: RuleHousehold["source"] = {
  floorLevelVsRoad: "BELOW_ROAD",
  hasFloodedBefore: true,
  maxFloodDepthCm: 150,
  lastFloodDurationDays: 10,
  hasSurvivalKit: false,
  nearestEvacSiteType: "UNKNOWN",
};

describe("applyRiskEdit / toEditValues", () => {
  it("ค่าปัจจุบัน → ฟอร์ม → config ได้ค่าเดิมทุกตัว ยกเว้นป้ายเวอร์ชัน", () => {
    const next = applyRiskEdit(DRAFT_RISK_CONFIG_V1, toEditValues(ACTIVE), 2);
    expect(next.factors).toEqual(DRAFT_RISK_CONFIG_V1.factors);
    expect(next.thresholds).toEqual(DRAFT_RISK_CONFIG_V1.thresholds);
    expect(next.weightVersion).toBe("2.0-draft");
    expect(diffRules({ ...ACTIVE }, { risk: next, triage: MAP, isDraft: true })).toEqual([]);
  });

  it("แก้น้ำหนัก/เกณฑ์/กฎบังคับ แล้วไม่แตะ config เดิม (ไม่เขียนทับ)", () => {
    const edit = toEditValues(ACTIVE);
    const next = applyRiskEdit(
      DRAFT_RISK_CONFIG_V1,
      { ...edit, weights: { ...edit.weights, FLOOR_LEVEL: 30 }, thresholds: { LOW: 20, MEDIUM: 45, HIGH: 70 }, hardRules: { ...edit.hardRules, DIALYSIS_MIN_HIGH: "CRITICAL" }, approved: true },
      3,
    );
    expect(next.factors.find((f) => f.code === "FLOOR_LEVEL")?.weight).toBe(30);
    expect(totalSystemWeight(next)).toBe(totalSystemWeight(DRAFT_RISK_CONFIG_V1) + 10);
    expect(next.thresholds.at(-1)).toEqual({ level: "CRITICAL", maxInclusive: 100 });
    expect(next.draft).toBe(false);
    expect(next.weightVersion).toBe(weightVersionLabel(3, false));
    expect(DRAFT_RISK_CONFIG_V1.factors.find((f) => f.code === "FLOOR_LEVEL")?.weight).toBe(20);

    const changes = diffRules(ACTIVE, { risk: next, triage: { ...MAP, PREGNANT: "P1" }, isDraft: false });
    expect(changes.map((c) => c.field)).toEqual([
      "weight.FLOOR_LEVEL", "threshold.LOW", "threshold.MEDIUM", "threshold.HIGH", "hardRule.DIALYSIS_MIN_HIGH", "triage.PREGNANT", "isDraft",
    ]);
  });

  it("คำอธิบายการเปลี่ยนเป็นภาษาไทย ไม่มีรหัส P1–P3", () => {
    const names = { factors: { FLOOR_LEVEL: "ระดับพื้นเทียบถนน" }, hardRules: {}, types: { PREGNANT: "หญิงตั้งครรภ์" } };
    expect(describeRuleChange({ field: "weight.FLOOR_LEVEL", old: 20, new: 30 }, names)).toBe("น้ำหนัก ระดับพื้นเทียบถนน: 20 → 30");
    const triage = describeRuleChange({ field: "triage.PREGNANT", old: "P2", new: "P1" }, names);
    expect(triage).toBe("หญิงตั้งครรภ์: เร่งด่วน → วิกฤต");
    expect(triage).not.toMatch(/P[123]/);
    expect(describeRuleChange({ field: "minConfidence", old: 0.6, new: 0.5 }, names)).toBe("ความมั่นใจขั้นต่ำ: 60% → 50%");
  });
});

describe("ความเร่งด่วนเมื่อเปลี่ยนการจับคู่", () => {
  const newMap: TriageMap = { ...MAP, PREGNANT: "P1" };

  it("ยังไม่บันทึก → ตามเกณฑ์ใหม่ · บันทึกตามเกณฑ์เดิม → ย้ายตาม · ปรับเอง → คงไว้", () => {
    const unassessed = { stored: null, typeCodes: ["PREGNANT"] };
    expect(personTriage(unassessed, MAP)).toBe("P2");
    expect(personTriage(unassessed, newMap)).toBe("P1");
    expect(storedTriageAfterMapChange(unassessed, MAP, newMap)).toBeNull();

    const auto = { stored: "P2" as const, typeCodes: ["PREGNANT"] };
    expect(storedTriageAfterMapChange(auto, MAP, newMap)).toBe("P1");

    const manual = { stored: "P3" as const, typeCodes: ["PREGNANT"] };
    expect(storedTriageAfterMapChange(manual, MAP, newMap)).toBe("P3");

    // หลายลักษณะ: ระดับที่เร่งด่วนสุดของเกณฑ์ใหม่
    const mixed = { stored: "P3" as const, typeCodes: ["CHILD_UNDER_5", "OTHER"] };
    expect(storedTriageAfterMapChange(mixed, MAP, { ...MAP, OTHER: "P2" })).toBe("P2");
  });

  it("ตัวอย่างผลกระทบนับคนและบ้านก่อน/หลัง", () => {
    const households: RuleHousehold[] = [
      { source: BLANK_SOURCE, persons: [{ stored: "P2", typeCodes: ["PREGNANT"] }, { stored: "P1", typeCodes: ["BEDRIDDEN"] }] },
      { source: BLANK_SOURCE, persons: [{ stored: "P3", typeCodes: ["PREGNANT"] }] },
      { source: FULL_RISK_SOURCE, persons: [] },
    ];
    const impact = computeRuleImpact(households, { triage: MAP, risk: DRAFT_RISK_CONFIG_V1 }, { triage: newMap, risk: DRAFT_RISK_CONFIG_V1 });
    expect(impact.households).toBe(3);
    expect(impact.people.before).toEqual({ P1: 1, P2: 1, P3: 1, UNASSESSED: 0 });
    expect(impact.people.after).toEqual({ P1: 2, P2: 0, P3: 1, UNASSESSED: 0 });
    expect(impact.peopleChanged).toBe(1);
    const total = (t: Record<string, number>) => Object.values(t).reduce((s, n) => s + n, 0);
    expect(total(impact.risk.before)).toBe(3);
    expect(total(impact.risk.after)).toBe(3);
  });

  it("ลดเกณฑ์ → บ้านความเสี่ยงสูงมากเพิ่ม (ตัวเลขที่แอดมินเห็นก่อนบันทึก)", () => {
    const h: RuleHousehold = { source: FULL_RISK_SOURCE, persons: [] };
    const before = evaluateHousehold(h, MAP, DRAFT_RISK_CONFIG_V1).risk.riskLevelAuto;
    const lowered = applyRiskEdit(DRAFT_RISK_CONFIG_V1, { ...toEditValues(ACTIVE), thresholds: { LOW: 10, MEDIUM: 20, HIGH: 30 } }, 2);
    const impact = computeRuleImpact([h], { triage: MAP, risk: DRAFT_RISK_CONFIG_V1 }, { triage: MAP, risk: lowered });
    expect(before).not.toBe("CRITICAL");
    expect(impact.risk.after.CRITICAL).toBe(1);
    expect(impact.householdsChanged).toBe(1);
  });

  it("กฎบังคับยังทำงานผ่าน evaluateHousehold (ติดเตียง → อย่างน้อยสูง)", () => {
    const r = evaluateHousehold({ source: BLANK_SOURCE, persons: [{ stored: null, typeCodes: ["BEDRIDDEN"] }] }, MAP, DRAFT_RISK_CONFIG_V1);
    expect(r.tally.P1).toBe(1);
    expect(r.risk.riskLevelAuto).toBe("HIGH");
    expect(r.risk.appliedHardRules).toContain("BEDRIDDEN_MIN_HIGH");
  });
});

describe("ลำดับการช่วยเหลือ", () => {
  const c = (sheetNo: string, urgency: HelpCandidate["urgency"], absoluteScore: number, confidence = 0.8): HelpCandidate => ({ sheetNo, urgency, absoluteScore, confidence });

  it("ความเร่งด่วนก่อน → คะแนน → ความมั่นใจ → รหัสใบ", () => {
    const ranked = rankHelpCases([
      c("SK-000005", "none", 90),
      c("SK-000004", "watch", 10),
      c("SK-000003", "critical", 5),
      c("SK-000002", "critical", 40, 0.5),
      c("SK-000001", "critical", 40, 0.9),
      c("SK-000006", "unknown", 50),
      c("SK-000007", "urgent", 0),
    ]);
    expect(ranked.map((r) => r.sheetNo)).toEqual([
      "SK-000001", "SK-000002", "SK-000003", "SK-000007", "SK-000004", "SK-000006", "SK-000005",
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("ค่าเพี้ยนไม่ดันบ้านขึ้นหัวรายการ · คะแนนเท่ากันเรียงคงที่", () => {
    expect(compareHelpPriority(c("A", "watch", Number.NaN), c("B", "watch", 1))).toBeGreaterThan(0);
    expect(compareHelpPriority(c("A", "watch", 1), c("B", "watch", 1))).toBeLessThan(0);
  });
});

describe("Zod — ค่าที่แอดมินส่งมา", () => {
  const valid = () => {
    const v = toEditValues(ACTIVE);
    return { ...v, baseVersionNo: 1, reason: "ปรับตามที่ประชุม" };
  };

  it("ค่าปัจจุบันผ่าน · เกณฑ์ไม่เรียง/ติดลบ/ไม่ครบปัจจัย/เหตุผลสั้น ไม่ผ่าน", () => {
    expect(ruleEditSchema.safeParse(valid()).success).toBe(true);
    expect(ruleEditSchema.safeParse({ ...valid(), thresholds: { LOW: 50, MEDIUM: 40, HIGH: 75 } }).success).toBe(false);
    expect(ruleEditSchema.safeParse({ ...valid(), thresholds: { LOW: 25, MEDIUM: 50, HIGH: 100 } }).success).toBe(false);
    expect(ruleEditSchema.safeParse({ ...valid(), weights: { ...valid().weights, FLOOR_LEVEL: -1 } }).success).toBe(false);
    expect(ruleEditSchema.safeParse({ ...valid(), weights: { ...valid().weights, FLOOR_LEVEL: 2.3 } }).success).toBe(false);
    const { FLOOR_LEVEL: _omit, ...partial } = valid().weights;
    expect(ruleEditSchema.safeParse({ ...valid(), weights: partial }).success).toBe(false);
    expect(ruleEditSchema.safeParse({ ...valid(), triage: { ...MAP, PREGNANT: "P4" } }).success).toBe(false);
    expect(ruleEditSchema.safeParse({ ...valid(), reason: "สั้น" }).success).toBe(false);
    expect(rulePreviewSchema.safeParse({ ...valid(), reason: "" }).success).toBe(true);
    const zero = Object.fromEntries(Object.keys(valid().weights).map((k) => [k, 0]));
    expect(ruleEditSchema.safeParse({ ...valid(), weights: zero }).success).toBe(false);
  });

  it("ค่าร่างในโค้ดผ่าน schema ที่ใช้อ่านจากฐานข้อมูล", () => {
    expect(storedRiskConfigSchema.safeParse(JSON.parse(JSON.stringify(DRAFT_RISK_CONFIG_V1))).success).toBe(true);
    expect(storedRiskConfigSchema.safeParse({ ...DRAFT_RISK_CONFIG_V1, factors: [] }).success).toBe(false);
  });
});

describe("ชื่อปัจจัยบนหน้าจอ (ไม่มีรหัส P1–P3 · docs/40)", () => {
  it("ทุกปัจจัยในค่าตั้งต้นแสดงเป็นคำไทยล้วน", () => {
    for (const f of DRAFT_RISK_CONFIG_V1.factors) {
      expect(factorLabel(f)).not.toMatch(/P[1-4]/);
      expect(factorSource(f)).not.toMatch(/derived/);
    }
    expect(factorLabel({ code: "HAS_P1", nameTh: "มีกลุ่มเปราะบาง P1" })).toBe("มีคนระดับวิกฤตในบ้าน");
  });

  it("ปัจจัยอื่นใช้ชื่อที่เก็บไว้ตามเดิม", () => {
    expect(factorLabel({ code: "FLOOR_LEVEL", nameTh: "ระดับพื้นเทียบถนน" })).toBe("ระดับพื้นเทียบถนน");
  });
});
