import { describe, expect, it } from "vitest";
import {
  DRAFT_RISK_CONFIG_V1 as CONFIG,
  classifyLevel,
  clamp01,
  computeRiskProfile,
  isAvailable,
  totalSystemWeight,
  type FactorCode,
  type FactorInput,
  type FieldStatus,
} from "../../domain/risk";

// ── helpers ──────────────────────────────────────────────────────────────────
function f(
  code: FactorCode,
  value: number,
  status: FieldStatus = "HAS_VALUE",
  verified = false,
): FactorInput {
  return { code, value, status, verified };
}

/** ทุกปัจจัย value=1 (เสี่ยงเต็ม), มีข้อมูล, ตั้ง verified ตามพารามิเตอร์ */
function allFactors(verified = false): FactorInput[] {
  return CONFIG.factors.map((fw) => f(fw.code, 1, "HAS_VALUE", verified));
}

describe("totalSystemWeight / config", () => {
  it("น้ำหนักรวม = 115 จาก 12 ปัจจัย (v1.0-draft)", () => {
    expect(totalSystemWeight(CONFIG)).toBe(115);
    expect(CONFIG.factors).toHaveLength(12);
    expect(CONFIG.draft).toBe(true); // ต้องยังเป็น draft จนกว่ารับรอง
  });
});

describe("clamp01 / isAvailable", () => {
  it("clamp เข้า 0..1 และค่าเพี้ยน → 0", () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("HAS_VALUE/EXPLICIT_NONE = มีข้อมูล · BLANK/ILLEGIBLE = ไม่มี", () => {
    expect(isAvailable("HAS_VALUE")).toBe(true);
    expect(isAvailable("EXPLICIT_NONE")).toBe(true);
    expect(isAvailable("BLANK_IN_PAPER")).toBe(false);
    expect(isAvailable("ILLEGIBLE")).toBe(false);
  });
});

describe("classifyLevel — half-open ปิดช่องว่าง (RISK-03)", () => {
  const cases: [number, string][] = [
    [0, "LOW"],
    [25, "LOW"],
    [25.5, "MEDIUM"], // เดิมตกช่องว่าง
    [50, "MEDIUM"],
    [50.7, "HIGH"], // เดิมตกช่องว่าง
    [75, "HIGH"],
    [75.3, "CRITICAL"], // เดิมตกช่องว่าง
    [100, "CRITICAL"],
  ];
  it.each(cases)("absoluteScore %s → %s", (score, level) => {
    expect(classifyLevel(score, CONFIG)).toBe(level);
  });
});

describe("คะแนนเต็ม — ข้อมูลครบ ยืนยันครบ", () => {
  it("value=1 ทุกปัจจัย + verified → 100/CRITICAL/confidence 1", () => {
    const r = computeRiskProfile({ factors: allFactors(true) });
    expect(r.rawScore).toBe(115);
    expect(r.maximumPossibleScore).toBe(115);
    expect(r.normalizedScore).toBe(100);
    expect(r.absoluteScore).toBe(100);
    expect(r.dataCompleteness).toBe(1);
    expect(r.verificationLevel).toBe(1);
    expect(r.riskConfidence).toBe(1);
    expect(r.riskLevelAuto).toBe("CRITICAL");
    expect(r.factorsUsed).toBe(12);
    expect(r.factorsTotal).toBe(12);
  });
});

describe("RISK-02 — ข้อมูลขาดต้องลด confidence ไม่ใช่ดันคะแนนพุ่ง", () => {
  // กรณี B ในเอกสาร: รู้แค่ "พื้นต่ำกว่าถนน" (1 ปัจจัย เสี่ยงเต็ม) ที่เหลือ BLANK
  const caseB = computeRiskProfile({
    factors: [f("FLOOR_LEVEL", 1, "HAS_VALUE")],
  });

  it("normalizedScore พุ่งเป็น 100 (นี่คือกับดักที่ห้ามใช้จัดระดับ)", () => {
    expect(caseB.normalizedScore).toBe(100);
  });

  it("absoluteScore สะท้อนความจริง ≈ 17.4 (20/115)", () => {
    expect(caseB.absoluteScore).toBeCloseTo(17.39, 1);
  });

  it("confidence ต่ำ → ไม่แสดงระดับ (ไม่ปลอมเป็น CRITICAL)", () => {
    expect(caseB.riskConfidence).toBeLessThan(CONFIG.minConfidence);
    expect(caseB.riskLevelAuto).toBeNull();
  });

  it("บ้านข้อมูลครบเสี่ยงจริงต้อง 'จัดระดับได้' ต่างจากบ้านข้อมูลขาด", () => {
    // A: ข้อมูลครบ ยืนยันครบ absolute 78 → CRITICAL, มีระดับ
    const caseA = computeRiskProfile({
      factors: CONFIG.factors.map((fw) =>
        f(fw.code, fw.code === "FLOOR_LEVEL" ? 1 : 0.75, "HAS_VALUE", true),
      ),
    });
    expect(caseA.riskLevelAuto).not.toBeNull();
    // B (ข้อมูลขาด) จัดระดับไม่ได้ → ไม่มีทางไปแซง A ใน priority list
    expect(caseB.riskLevelAuto).toBeNull();
  });
});

describe("RISK-05 — confidence ต้องถ่วงน้ำหนัก (ปัจจัยหนักสำคัญกว่าปัจจัยเบา)", () => {
  it("รู้ 3 ปัจจัยหนัก (55) confidence สูงกว่ารู้ 6 ปัจจัยเบา (27)", () => {
    const heavy = computeRiskProfile({
      factors: [
        f("FLOOR_LEVEL", 0.5),
        f("HAS_P1", 0.5),
        f("HAS_FLOODED", 0.5),
      ],
    });
    const light = computeRiskProfile({
      factors: [
        f("FLOOD_DURATION", 0.5),
        f("NO_SURVIVAL_KIT", 0.5),
        f("NO_RESOURCES", 0.5),
        f("UNKNOWN_EVAC_SITE", 0.5),
        f("NO_DIGITAL_CHANNEL", 0.5),
        f("FAR_FROM_EVAC", 0.5),
      ],
    });
    // นับจำนวน: light มี 6 ปัจจัย > heavy 3 → ถ้าใช้ count-based light จะชนะ (ผิด)
    expect(light.factorsUsed).toBeGreaterThan(heavy.factorsUsed);
    // แต่ถ่วงน้ำหนักแล้ว heavy ต้องมั่นใจกว่า
    expect(heavy.riskConfidence).toBeGreaterThan(light.riskConfidence);
  });
});

describe("RISK-04 — EXPLICIT_NONE เป็นความเสี่ยง · BLANK/ILLEGIBLE ตัดออก", () => {
  it("EXPLICIT_NONE (ยืนยันไม่มีรถ) นับเป็นความเสี่ยงและนับใน confidence", () => {
    const r = computeRiskProfile({ factors: [f("NO_VEHICLE", 1, "EXPLICIT_NONE")] });
    expect(r.rawScore).toBe(8);
    expect(r.maximumPossibleScore).toBe(8);
    expect(r.factorsUsed).toBe(1);
  });

  it("BLANK และ ILLEGIBLE ไม่ถูกนับ (ไม่สร้างความเสี่ยงปลอม)", () => {
    const r = computeRiskProfile({
      factors: [
        f("NO_VEHICLE", 1, "BLANK_IN_PAPER"),
        f("FLOOR_LEVEL", 1, "ILLEGIBLE"),
      ],
    });
    expect(r.rawScore).toBe(0);
    expect(r.maximumPossibleScore).toBe(0);
    expect(r.factorsUsed).toBe(0);
    expect(r.normalizedScore).toBeNull();
  });
});

describe("verificationLevel", () => {
  it("= น้ำหนักที่ verified / น้ำหนักที่มีข้อมูล", () => {
    const r = computeRiskProfile({
      factors: CONFIG.factors.map((fw) =>
        f(fw.code, 0.5, "HAS_VALUE", fw.code === "FLOOR_LEVEL"),
      ),
    });
    expect(r.maximumPossibleScore).toBe(115);
    expect(r.verificationLevel).toBeCloseTo(20 / 115, 5);
    expect(r.riskConfidence).toBeCloseTo(1 * (0.7 + 0.3 * (20 / 115)), 5);
  });
});

describe("Hard Rules — ติดเตียง/ฟอกไต ยกพื้น ≥ HIGH", () => {
  it("ติดเตียง + ข้อมูลน้อย (ปกติ null) → ยกเป็น HIGH และบันทึกกฎ", () => {
    const r = computeRiskProfile({
      factors: [f("FLOOR_LEVEL", 0, "HAS_VALUE")], // confidence ต่ำ → ปกติ null
      hasBedridden: true,
    });
    expect(r.riskLevelAuto).toBe("HIGH");
    expect(r.appliedHardRules).toContain("BEDRIDDEN_MIN_HIGH");
  });

  it("ถ้าคำนวณได้ CRITICAL อยู่แล้ว Hard Rule (HIGH) ต้องไม่ลดระดับ", () => {
    const r = computeRiskProfile({ factors: allFactors(true), hasDialysis: true });
    expect(r.riskLevelAuto).toBe("CRITICAL");
    expect(r.appliedHardRules).toContain("DIALYSIS_MIN_HIGH");
  });

  it("ไม่มีเงื่อนไข Hard Rule → appliedHardRules ว่าง", () => {
    const r = computeRiskProfile({ factors: allFactors(true) });
    expect(r.appliedHardRules).toEqual([]);
  });
});

describe("ไม่มีข้อมูลเลย", () => {
  it("ทุกอย่างเป็นศูนย์/ว่าง ไม่ระเบิด (หารศูนย์)", () => {
    const r = computeRiskProfile({ factors: [] });
    expect(r.rawScore).toBe(0);
    expect(r.maximumPossibleScore).toBe(0);
    expect(r.normalizedScore).toBeNull();
    expect(r.absoluteScore).toBe(0);
    expect(r.dataCompleteness).toBe(0);
    expect(r.riskConfidence).toBe(0);
    expect(r.riskLevelAuto).toBeNull();
    expect(r.factorsUsed).toBe(0);
  });
});

describe("traceability", () => {
  it("ติด version ของสูตร/น้ำหนักไว้ในผลลัพธ์ทุกครั้ง (CLAUDE.md)", () => {
    const r = computeRiskProfile({ factors: allFactors() });
    expect(r.formulaVersion).toBe("1.0");
    expect(r.weightVersion).toBe("1.0-draft");
  });
});
