import { describe, expect, it } from "vitest";
import {
  closestToNextFlag,
  DEFAULT_FLAG_CRITERIA,
  diffFlagCriteria,
  estimateBridgeFlag,
  estimateCommunityFlag,
  thresholdMsl,
  validateFlagCriteria,
  type FlagCriteriaConfig,
} from "../../domain/water/community-flags";

const C = DEFAULT_FLAG_CRITERIA;
const bridge = (code: string) => C.bridges.find((b) => b.stationCode === code)!;
const e = (code: string, level: number | null, config: FlagCriteriaConfig = C) =>
  estimateBridgeFlag(config, config.bridges.find((b) => b.stationCode === code)!, level);
const clone = (): FlagCriteriaConfig => structuredClone(C);

describe("thresholdMsl", () => {
  it("แปลงเกณฑ์ทั้ง 3 แบบเป็น ม.รทก.", () => {
    expect(thresholdMsl({ type: "belowSoffit", meters: 2 }, { soffitMsl: 9.93, deckMsl: 11.25 })).toBeCloseTo(7.93, 5);
    expect(thresholdMsl({ type: "deck" }, { soffitMsl: 15.3, deckMsl: 16.96 })).toBe(16.96);
    expect(thresholdMsl({ type: "msl", value: 8 }, { soffitMsl: null, deckMsl: null })).toBe(8);
  });
  it("ขาดค่าสะพานที่ต้องใช้ = null", () => {
    expect(thresholdMsl({ type: "belowSoffit", meters: 2 }, { soffitMsl: null, deckMsl: 11 })).toBeNull();
    expect(thresholdMsl({ type: "deck" }, { soffitMsl: 9, deckMsl: null })).toBeNull();
  });
});

describe("estimateBridgeFlag", () => {
  it("บางศาลา: เหลือง 3 ม. / แดง 2 ม. ใต้ท้องสะพาน 9.93", () => {
    expect(e("X.90", 2.95).flag?.key).toBe("GREEN");
    expect(e("X.90", 7.0).flag?.key).toBe("YELLOW");
    expect(e("X.90", 8.0).flag?.key).toBe("RED");
    expect(e("X.90", 0).lines.map((l) => l.level.key)).toEqual(["YELLOW", "RED"]);
    expect(e("X.90", 0).lines[1]!.msl).toBeCloseTo(7.93, 2);
  });
  it("ถึงเกณฑ์พอดีนับว่าถึง", () => {
    expect(e("X.174", bridge("X.174").soffitMsl! - 4).flag?.key).toBe("YELLOW");
  });
  it("ม่วงก็อง: แดง = จมสะพาน", () => {
    expect(e("X.173A", 15).flag?.key).toBe("YELLOW");
    expect(e("X.173A", 16.97).flag?.key).toBe("RED");
    expect(e("X.173A", 0).lines[1]!.viaDeck).toBe(true);
  });
  it("บอกเส้นถัดไปและระยะ", () => {
    expect(e("X.90", 7.5).next).toMatchObject({ line: { level: { key: "RED" } } });
    expect(e("X.90", 7.5).next!.meters).toBeCloseTo(0.43, 2);
    expect(e("X.90", 9).next).toBeNull();
  });
  it("ไม่มีระดับน้ำ/ค่าเพี้ยน = ไม่ทราบ (ไม่เดาว่าปกติ)", () => {
    expect(e("X.90", null).flag).toBeNull();
    expect(e("X.90", Number.NaN).flag).toBeNull();
  });
  it("ไม่มีเกณฑ์ที่คำนวณได้ = ไม่ทราบ", () => {
    const c = clone();
    c.bridges[0]!.soffitMsl = null;
    c.bridges[0]!.thresholds = { YELLOW: { type: "belowSoffit", meters: 4 } };
    expect(estimateBridgeFlag(c, c.bridges[0]!, 5).flag).toBeNull();
  });
  it("เพิ่มระดับธงส้มระหว่างเหลืองกับแดงได้", () => {
    const c = clone();
    c.levels.splice(2, 0, { key: "ORANGE", label: "ธงส้ม", title: "เตรียมอพยพ", headline: "เตรียมอพยพ", action: "เตรียมอพยพ", color: "orange", siren: false });
    c.bridges.find((b) => b.stationCode === "X.90")!.thresholds.ORANGE = { type: "belowSoffit", meters: 2.5 };
    expect(validateFlagCriteria(c)).toBeNull();
    expect(e("X.90", 7.5, c).flag?.key).toBe("ORANGE"); // 9.93 - 2.5 = 7.43
    expect(e("X.90", 7.2, c).next?.line.level.key).toBe("ORANGE");
  });
});

describe("estimateCommunityFlag / closestToNextFlag", () => {
  it("ธงของกลุ่ม = ธงสูงสุดของทุกสะพาน · ไม่ทราบไม่นับ", () => {
    expect(estimateCommunityFlag(C, [e("X.174", 4), e("X.173A", 10), e("X.90", 7.5)])?.key).toBe("YELLOW");
    expect(estimateCommunityFlag(C, [e("X.174", 7.1), e("X.173A", 10), e("X.90", 3)])?.key).toBe("RED");
    expect(estimateCommunityFlag(C, [e("X.174", null), e("X.90", 3)])?.key).toBe("GREEN");
    expect(estimateCommunityFlag(C, [e("X.174", null), e("X.90", null)])).toBeNull();
    expect(estimateCommunityFlag(C, [])).toBeNull();
  });
  it("สะพานที่ใกล้ธงถัดไปที่สุด", () => {
    const c = closestToNextFlag([e("X.174", 4.78), e("X.173A", 10.45), e("X.90", 2.88)]);
    expect(c).toMatchObject({ stationCode: "X.174", next: { key: "YELLOW" } });
    expect(c!.meters).toBeCloseTo(10.019 - 4 - 4.78, 2);
    expect(closestToNextFlag([e("X.90", 9), e("X.174", null)])).toBeNull();
  });
});

describe("validateFlagCriteria", () => {
  it("ค่าตั้งต้นถูกต้อง", () => {
    expect(validateFlagCriteria(C)).toBeNull();
  });
  it("เกณฑ์ระดับสูงต้องสูงกว่าระดับต่ำ", () => {
    const c = clone();
    c.bridges[0]!.thresholds.RED = { type: "belowSoffit", meters: 5 }; // ต่ำกว่าเหลือง (4 ม.)
    expect(validateFlagCriteria(c)).toMatch(/ต้องสูงกว่า/);
  });
  it("อ้างท้องสะพานแต่ไม่มีค่า", () => {
    const c = clone();
    c.bridges[0]!.soffitMsl = null;
    expect(validateFlagCriteria(c)).toMatch(/ท้องสะพาน/);
  });
  it("พื้นสะพานต่ำกว่าท้องสะพาน", () => {
    const c = clone();
    c.bridges[1]!.deckMsl = 10;
    expect(validateFlagCriteria(c)).toMatch(/พื้นสะพาน/);
  });
  it("รหัสระดับซ้ำ / สถานีซ้ำ / ระดับปกติมีเกณฑ์", () => {
    const a = clone();
    a.levels[1]!.key = "GREEN";
    expect(validateFlagCriteria(a)).toMatch(/ซ้ำ/);
    const b = clone();
    b.bridges[1]!.stationCode = "X.174";
    expect(validateFlagCriteria(b)).toMatch(/ซ้ำ/);
    const d = clone();
    d.bridges[0]!.thresholds.GREEN = { type: "belowSoffit", meters: 6 };
    expect(validateFlagCriteria(d)).toMatch(/ระดับปกติ/);
  });
});

describe("diffFlagCriteria", () => {
  it("สรุปการเปลี่ยนเป็นภาษาไทย", () => {
    const c = clone();
    c.bridges[2]!.soffitMsl = 10.1;
    c.bridges[2]!.thresholds.RED = { type: "belowSoffit", meters: 1.5 };
    c.levels.splice(2, 0, { key: "ORANGE", label: "ธงส้ม", title: "t", headline: "h", action: "a", color: "orange", siren: false });
    const d = diffFlagCriteria(C, c);
    expect(d).toContain("เพิ่มระดับ “ธงส้ม” (สีส้ม)");
    expect(d).toContain("สะพานบางศาลา: ระดับท้องสะพาน 9.93 ม.รทก. → 10.1 ม.รทก.");
    expect(d).toContain("สะพานบางศาลา: ธงแดง ต่ำกว่าท้องสะพาน 2 ม. → ต่ำกว่าท้องสะพาน 1.5 ม.");
    expect(diffFlagCriteria(C, clone())).toEqual([]);
  });
});
