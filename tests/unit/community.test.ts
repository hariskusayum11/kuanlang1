import { describe, expect, it } from "vitest";
import { validatePopulationInput } from "../../lib/community/core";

describe("validatePopulationInput — ตัวหาร Coverage (pure)", () => {
  it("total NULL (ยังไม่ทราบ) + target 60 → ผ่าน", () => {
    const r = validatePopulationInput({ totalHouseholds: null, targetCoveragePercent: 60 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.totalHouseholds).toBeNull();
  });

  it("total เป็นจำนวนเต็มบวก → ผ่าน", () => {
    const r = validatePopulationInput({ totalHouseholds: 500, targetCoveragePercent: 65 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ totalHouseholds: 500, targetCoveragePercent: 65 });
  });

  it("total = 0 / ติดลบ / ทศนิยม / เกินเพดาน → ไม่ผ่าน (ไม่ใช้ 0 เป็นตัวหาร)", () => {
    for (const bad of [0, -5, 2.5, 1_000_001]) {
      expect(validatePopulationInput({ totalHouseholds: bad, targetCoveragePercent: 60 }).ok).toBe(
        false,
      );
    }
  });

  it("target นอกช่วง 1–100 → ไม่ผ่าน", () => {
    expect(validatePopulationInput({ totalHouseholds: 100, targetCoveragePercent: 0 }).ok).toBe(false);
    expect(validatePopulationInput({ totalHouseholds: 100, targetCoveragePercent: 101 }).ok).toBe(false);
    expect(validatePopulationInput({ totalHouseholds: 100, targetCoveragePercent: 100 }).ok).toBe(true);
  });

  it("source/note: trim + ค่าว่าง → null", () => {
    const r = validatePopulationInput({
      totalHouseholds: 100,
      targetCoveragePercent: 60,
      dataSource: "  ทะเบียนราษฎร์ 2567  ",
      dataNote: "   ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.dataSource).toBe("ทะเบียนราษฎร์ 2567");
      expect(r.value.dataNote).toBeNull();
    }
  });
});
