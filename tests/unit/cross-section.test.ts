import { describe, it, expect } from "vitest";
import { peakLagHours, waterPolygons, wetWidth, X44_CROSS_SECTION } from "../../domain/water/cross-section";

// รูปตัดขวางคลองอู่ตะเภาที่หาดใหญ่ใน (กรมชลประทาน 2569) + เวลาเดินทางของยอดน้ำ

const V: Array<[number, number]> = [[0, 10], [10, 0], [20, 10]];

describe("waterPolygons", () => {
  it("ตัดตลิ่งสองฝั่งแบบเส้นตรง", () => {
    const polys = waterPolygons(V, 5);
    expect(polys).toHaveLength(1);
    expect(polys[0]![0]).toEqual([5, 5]);
    expect(polys[0]!.at(-1)).toEqual([15, 5]);
    expect(wetWidth(polys)).toBeCloseTo(10, 5);
  });
  it("ระดับต่ำกว่าท้องน้ำ = ไม่มีน้ำ · ค่าเพี้ยน = ไม่มีน้ำ", () => {
    expect(waterPolygons(V, -1)).toEqual([]);
    expect(waterPolygons(V, null)).toEqual([]);
    expect(waterPolygons(V, Number.NaN)).toEqual([]);
  });
  it("สูงกว่าตลิ่งทั้งสองฝั่ง = น้ำเต็มความกว้างของรูป", () => {
    const polys = waterPolygons(V, 12);
    expect(polys).toHaveLength(1);
    expect(wetWidth(polys)).toBe(20);
  });
  it("X.44 จริง: ระดับปกติ ~1 ม.รทก. กว้างราว 30–40 ม. · น้ำท่วม พ.ย. 68 (9.97) ล้นทั้งสองฝั่ง", () => {
    const now = wetWidth(waterPolygons(X44_CROSS_SECTION.points, 1.0));
    expect(now).toBeGreaterThan(30);
    expect(now).toBeLessThan(45);
    expect(wetWidth(waterPolygons(X44_CROSS_SECTION.points, 9.97))).toBe(133);
  });
});

describe("peakLagHours", () => {
  const s = (pairs: Array<[string, number]>) => pairs.map(([at, levelMsl]) => ({ at, levelMsl }));
  it("พ.ย. 68: บางศาลาสูงสุด 24 พ.ย. 23:00 → หาดใหญ่ใน 25 พ.ย. 10:00 = 11 ชม.", () => {
    expect(peakLagHours(s([["2025-11-24 22:00", 12], ["2025-11-24 23:00", 12.18]]), s([["2025-11-25 10:00", 9.97], ["2025-11-25 11:00", 9.9]]))).toBe(11);
  });
  it("ยอดปลายน้ำมาก่อนต้นน้ำ (ข้อมูลต้นน้ำผิดปกติ) = ใช้ไม่ได้", () => {
    expect(peakLagHours(s([["2025-11-25 02:00", 18]]), s([["2025-11-24 23:00", 12.18]]))).toBeNull();
  });
  it("ไม่มีข้อมูล = null", () => {
    expect(peakLagHours([], s([["2025-11-25 10:00", 9.97]]))).toBeNull();
  });
});
