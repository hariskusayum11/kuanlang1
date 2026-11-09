import { describe, it, expect } from "vitest";
import { peakLagHours } from "../../domain/water/peak-lag";

// เวลาที่ยอดน้ำเดินทางระหว่างสถานี (เหตุการณ์น้ำท่วม พ.ย. 68)

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
