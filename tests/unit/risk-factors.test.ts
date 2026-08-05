import { describe, expect, it } from "vitest";
import {
  computeRiskProfile,
  householdToRiskInput,
  type FactorCode,
  type HouseholdRiskSource,
} from "../../domain/risk";

const EMPTY: HouseholdRiskSource = {
  floorLevelVsRoad: null,
  hasFloodedBefore: null,
  maxFloodDepthCm: null,
  lastFloodDurationDays: null,
  hasSurvivalKit: null,
  nearestEvacSiteType: null,
  vulnerableTriages: [],
  vulnerabilityCodes: [],
};

function src(over: Partial<HouseholdRiskSource>): HouseholdRiskSource {
  return { ...EMPTY, ...over };
}
function val(s: HouseholdRiskSource, code: FactorCode): number | undefined {
  return householdToRiskInput(s).factors.find((f) => f.code === code)?.value;
}
function has(s: HouseholdRiskSource, code: FactorCode): boolean {
  return householdToRiskInput(s).factors.some((f) => f.code === code);
}

describe("householdToRiskInput — null = BLANK (ไม่ปล่อยออกมา)", () => {
  it("ครัวเรือนว่างเปล่า → มีแต่ HAS_P1/HAS_P2 (derived) เท่านั้น", () => {
    const codes = householdToRiskInput(EMPTY).factors.map((f) => f.code).sort();
    expect(codes).toEqual(["HAS_P1", "HAS_P2"]);
  });

  it("ปัจจัยที่ยัง map ไม่ได้จะไม่ถูกปล่อยเสมอ (BLANK ปลอดภัย)", () => {
    const full = src({
      floorLevelVsRoad: "BELOW_ROAD",
      hasFloodedBefore: true,
      maxFloodDepthCm: 120,
      lastFloodDurationDays: 10,
      hasSurvivalKit: false,
      nearestEvacSiteType: "UNKNOWN",
    });
    for (const code of ["NO_VEHICLE", "NO_RESOURCES", "NO_DIGITAL_CHANNEL", "FAR_FROM_EVAC"] as FactorCode[]) {
      expect(has(full, code)).toBe(false);
    }
  });
});

describe("การแปลงค่าแต่ละปัจจัย", () => {
  it("FLOOR_LEVEL: ต่ำ=1 เท่า=0.5 สูง=0", () => {
    expect(val(src({ floorLevelVsRoad: "BELOW_ROAD" }), "FLOOR_LEVEL")).toBe(1);
    expect(val(src({ floorLevelVsRoad: "EQUAL_ROAD" }), "FLOOR_LEVEL")).toBe(0.5);
    expect(val(src({ floorLevelVsRoad: "ABOVE_ROAD" }), "FLOOR_LEVEL")).toBe(0);
  });

  it("HAS_FLOODED: true=1 false=0", () => {
    expect(val(src({ hasFloodedBefore: true }), "HAS_FLOODED")).toBe(1);
    expect(val(src({ hasFloodedBefore: false }), "HAS_FLOODED")).toBe(0);
  });

  it("FLOOD_DEPTH normalize ที่ 100cm และ clamp เกิน 1", () => {
    expect(val(src({ maxFloodDepthCm: 50 }), "FLOOD_DEPTH")).toBe(0.5);
    expect(val(src({ maxFloodDepthCm: 100 }), "FLOOD_DEPTH")).toBe(1);
    expect(val(src({ maxFloodDepthCm: 250 }), "FLOOD_DEPTH")).toBe(1); // clamp
  });

  it("FLOOD_DURATION normalize ที่ 7 วัน", () => {
    expect(val(src({ lastFloodDurationDays: 7 }), "FLOOD_DURATION")).toBe(1);
    expect(val(src({ lastFloodDurationDays: 3.5 }), "FLOOD_DURATION")).toBe(0.5);
  });

  it("NO_SURVIVAL_KIT: ไม่เตรียม(false)=1 · เตรียม(true)=0", () => {
    expect(val(src({ hasSurvivalKit: false }), "NO_SURVIVAL_KIT")).toBe(1);
    expect(val(src({ hasSurvivalKit: true }), "NO_SURVIVAL_KIT")).toBe(0);
  });

  it("UNKNOWN_EVAC_SITE: UNKNOWN=1 · รู้จุด=0", () => {
    expect(val(src({ nearestEvacSiteType: "UNKNOWN" }), "UNKNOWN_EVAC_SITE")).toBe(1);
    expect(val(src({ nearestEvacSiteType: "SCHOOL" }), "UNKNOWN_EVAC_SITE")).toBe(0);
  });

  it("HAS_P1/HAS_P2 มาจาก triage และมีข้อมูลเสมอ", () => {
    expect(val(src({ vulnerableTriages: ["P1"] }), "HAS_P1")).toBe(1);
    expect(val(src({ vulnerableTriages: ["P2", "P3"] }), "HAS_P2")).toBe(1);
    expect(val(src({ vulnerableTriages: ["P3"] }), "HAS_P1")).toBe(0);
  });
});

describe("Hard Rules mapping", () => {
  it("โค้ด BEDRIDDEN/DIALYSIS → ตั้งธง hasBedridden/hasDialysis", () => {
    const input = householdToRiskInput(src({ vulnerabilityCodes: ["DIALYSIS"] }));
    expect(input.hasDialysis).toBe(true);
    expect(input.hasBedridden).toBe(false);
  });

  it("ติดเตียง + ข้อมูลอื่นน้อย → engine ยกเป็น HIGH", () => {
    const input = householdToRiskInput(src({ vulnerabilityCodes: ["BEDRIDDEN"] }));
    const r = computeRiskProfile(input);
    expect(r.riskLevelAuto).toBe("HIGH");
    expect(r.appliedHardRules).toContain("BEDRIDDEN_MIN_HIGH");
  });
});

describe("end-to-end — ครัวเรือนเสี่ยงสูง", () => {
  it("พื้นต่ำ+เคยท่วมลึก+มี P1 → คำนวณได้และจัดระดับได้", () => {
    const input = householdToRiskInput(
      src({
        floorLevelVsRoad: "BELOW_ROAD",
        hasFloodedBefore: true,
        maxFloodDepthCm: 150,
        lastFloodDurationDays: 10,
        hasSurvivalKit: false,
        nearestEvacSiteType: "UNKNOWN",
        vulnerableTriages: ["P1"],
      }),
    );
    const r = computeRiskProfile(input);
    expect(r.factorsUsed).toBe(8); // 8 ปัจจัยที่ map ได้
    expect(r.riskLevelAuto).not.toBeNull();
    expect(r.absoluteScore).toBeGreaterThan(50);
  });
});
