import { describe, it, expect } from "vitest";
import { calculateCoverage, validateTotalHouseholds } from "../../domain/coverage/coverage";

// Tests ที่ต้องเพิ่ม ข้อ 4-7 (Coverage) — Pure, รันได้โดยไม่ต้องมี DB
describe("Coverage (คำตัดสิน #1,#2)", () => {
  // ข้อ 4: Coverage เมื่อ totalHouseholds = NULL
  it("totalHouseholds = NULL → NOT_CALCULABLE (ไม่ใช่ 0%)", () => {
    const r = calculateCoverage({ count: 100, totalHouseholds: null, targetCoveragePercent: 60 });
    expect(r.kind).toBe("NOT_CALCULABLE");
  });

  // ข้อ 5: Coverage เมื่อ totalHouseholds = 0 ต้องถูก Validation ปฏิเสธ + ไม่หารศูนย์
  it("totalHouseholds = 0 → Validation ปฏิเสธ", () => {
    expect(validateTotalHouseholds(0).ok).toBe(false);
    expect(validateTotalHouseholds(-5).ok).toBe(false);
    expect(validateTotalHouseholds(null).ok).toBe(true);
    expect(validateTotalHouseholds(500).ok).toBe(true);
  });

  it("totalHouseholds = 0 → คำนวณต้องไม่หารศูนย์ (NOT_CALCULABLE)", () => {
    const r = calculateCoverage({ count: 50, totalHouseholds: 0, targetCoveragePercent: 60 });
    expect(r.kind).toBe("NOT_CALCULABLE");
  });

  // ข้อ 6: Coverage เท่ากับ 60% ต้องยังไม่ผ่าน (strict >)
  it("Coverage = 60% พอดี → ไม่ผ่าน (strict >)", () => {
    const r = calculateCoverage({ count: 60, totalHouseholds: 100, targetCoveragePercent: 60 });
    expect(r.kind).toBe("CALCULATED");
    if (r.kind === "CALCULATED") {
      expect(r.percent).toBe(60);
      expect(r.meetsTarget).toBe(false);
    }
  });

  // ข้อ 7: Coverage มากกว่า 60% ต้องผ่าน
  it("Coverage > 60% → ผ่าน", () => {
    const r = calculateCoverage({ count: 601, totalHouseholds: 1000, targetCoveragePercent: 60 });
    expect(r.kind).toBe("CALCULATED");
    if (r.kind === "CALCULATED") {
      expect(r.percent).toBe(60.1);
      expect(r.meetsTarget).toBe(true);
    }
  });

  it("Coverage ต่ำกว่าเป้า → ไม่ผ่าน", () => {
    const r = calculateCoverage({ count: 50, totalHouseholds: 100, targetCoveragePercent: 60 });
    if (r.kind === "CALCULATED") expect(r.meetsTarget).toBe(false);
  });

  it("Coverage เกิน 100% ได้ (ไม่ clamp)", () => {
    const r = calculateCoverage({ count: 110, totalHouseholds: 100, targetCoveragePercent: 60 });
    if (r.kind === "CALCULATED") expect(r.percent).toBe(110);
  });
});
