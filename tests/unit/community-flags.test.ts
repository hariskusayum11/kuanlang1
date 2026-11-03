import { describe, it, expect } from "vitest";
import {
  BRIDGE_REFERENCES,
  closestToNextFlag,
  estimateBridgeFlag,
  estimateCommunityFlag,
  flagBarScale,
  FLAG_BRIDGE_CRITERIA,
  thresholdMsl,
} from "../../domain/water/community-flags";

// ธงโดยประมาณ (หน้าต้นแบบ /lab/song-khlong) — เกณฑ์กลุ่มสองคลองควนลัง × ระดับสะพานจากกรมชลประทาน

const bridge = (code: string) => FLAG_BRIDGE_CRITERIA.find((c) => c.stationCode === code)!;

describe("thresholdMsl", () => {
  it("ต่ำกว่าท้องสะพาน x ม. = ท้องสะพาน − x", () => {
    expect(thresholdMsl({ belowSoffitM: 2 }, { soffitMsl: 9.93, deckMsl: 11.25 })).toBeCloseTo(7.93, 5);
  });
  it("จมสะพาน = ระดับพื้นสะพาน", () => {
    expect(thresholdMsl({ deck: true }, { soffitMsl: 15.3, deckMsl: 16.96 })).toBe(16.96);
  });
});

describe("estimateBridgeFlag", () => {
  it("บางศาลา: เหลืองที่ ~6.93 · แดงที่ ~7.93 (ใกล้เกณฑ์เฝ้าระวัง X.90 = 8.00 ของ Hatyai City Climate)", () => {
    const b = bridge("X.90");
    expect(estimateBridgeFlag(b, 2.95).flag).toBe("GREEN");
    expect(estimateBridgeFlag(b, 7.0).flag).toBe("YELLOW");
    expect(estimateBridgeFlag(b, 8.0).flag).toBe("RED");
    expect(estimateBridgeFlag(b, 0).redMsl).toBeCloseTo(7.93, 2);
  });
  it("ถึงเกณฑ์พอดีนับว่ายกธง", () => {
    const b = bridge("X.174");
    expect(estimateBridgeFlag(b, BRIDGE_REFERENCES["X.174"]!.soffitMsl - 4).flag).toBe("YELLOW");
  });
  it("ม่วงก็อง: แดงเมื่อจมสะพาน (ถึงพื้นสะพาน)", () => {
    const b = bridge("X.173A");
    expect(estimateBridgeFlag(b, 15).flag).toBe("YELLOW");
    expect(estimateBridgeFlag(b, 16.97).flag).toBe("RED");
  });
  it("ไม่มีข้อมูล/ค่าเพี้ยน = UNKNOWN ไม่ใช่ปกติ", () => {
    expect(estimateBridgeFlag(bridge("X.90"), null).flag).toBe("UNKNOWN");
    expect(estimateBridgeFlag(bridge("X.90"), Number.NaN).flag).toBe("UNKNOWN");
    expect(estimateBridgeFlag({ ...bridge("X.90"), stationCode: "ZZZ" }, 5).flag).toBe("UNKNOWN");
  });
});

describe("estimateCommunityFlag", () => {
  const e = (code: string, level: number | null) => estimateBridgeFlag(bridge(code), level);
  it("ใช้ธงสูงสุดของทุกสะพาน", () => {
    expect(estimateCommunityFlag([e("X.174", 4), e("X.173A", 10), e("X.90", 7.5)])).toBe("YELLOW");
    expect(estimateCommunityFlag([e("X.174", 7.1), e("X.173A", 10), e("X.90", 3)])).toBe("RED");
  });
  it("สะพานที่ไม่มีข้อมูลไม่ทำให้กลายเป็นปกติ และไม่มีข้อมูลเลย = UNKNOWN", () => {
    expect(estimateCommunityFlag([e("X.174", null), e("X.90", 3)])).toBe("GREEN");
    expect(estimateCommunityFlag([e("X.174", null), e("X.90", null)])).toBe("UNKNOWN");
    expect(estimateCommunityFlag([])).toBe("UNKNOWN");
  });
});

describe("closestToNextFlag", () => {
  const e = (code: string, level: number | null) => estimateBridgeFlag(bridge(code), level);
  it("เลือกสะพานที่ใกล้ธงถัดไปที่สุด", () => {
    // คลองหวะ 4.78 → ห่างธงเหลือง ~1.24 · บางศาลา 2.88 → ห่าง ~4.05
    const c = closestToNextFlag([e("X.174", 4.78), e("X.173A", 10.45), e("X.90", 2.88)]);
    expect(c?.bridge).toBe("สะพานบ้านคลองหวะ");
    expect(c?.next).toBe("YELLOW");
    expect(c?.meters).toBeCloseTo(1.239, 2);
  });
  it("สะพานที่เป็นธงเหลืองแล้ววัดระยะถึงธงแดง · ไม่มีข้อมูล/แดงแล้ว = ข้าม", () => {
    expect(closestToNextFlag([e("X.90", 7.5)])).toMatchObject({ next: "RED" });
    expect(closestToNextFlag([e("X.90", 9), e("X.174", null)])).toBeNull();
  });
});

describe("flagBarScale", () => {
  it("หมุดอยู่ก่อนช่วงเหลืองเมื่อยังเป็นธงเขียว และเรียงเหลือง < แดง", () => {
    const s = flagBarScale(estimateBridgeFlag(bridge("X.174"), 4.78))!;
    expect(s.levelPct).toBeLessThan(s.yellowPct);
    expect(s.yellowPct).toBeLessThan(s.redPct);
    expect(s.redPct).toBeLessThan(100);
  });
  it("น้ำเกินเกณฑ์แดงหมุดอยู่หลังเส้นแดงแต่ไม่เกิน 100%", () => {
    const s = flagBarScale(estimateBridgeFlag(bridge("X.90"), 12))!;
    expect(s.levelPct).toBeGreaterThan(s.redPct);
    expect(s.levelPct).toBeLessThanOrEqual(100);
  });
  it("ไม่มีระดับน้ำ = ไม่วาด", () => {
    expect(flagBarScale(estimateBridgeFlag(bridge("X.90"), null))).toBeNull();
  });
});
