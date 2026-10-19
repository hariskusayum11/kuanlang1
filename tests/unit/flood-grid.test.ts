import { describe, it, expect } from "vitest";
import { buildFloodGrid, gridLegend, gridLevel, GRID_MIN_HOUSEHOLDS, type FloodGridInput } from "../../domain/geo/flood-grid";
import { FLOOD_DEPTH_BINS } from "../../domain/flood/depth-scale";

// แผนที่ความรุนแรงน้ำท่วมแบบช่องพื้นที่ (docs/39)

const house = (lat: number, lng: number, depthCm: number | null, belowRoad: boolean | null = null, durationDays: number | null = null): FloodGridInput => ({ lat, lng, depthCm, belowRoad, durationDays });
// 5 หลังห่างกันไม่กี่เมตร → อยู่ช่องเดียวกัน
const cluster = (lat: number, lng: number, depths: Array<number | null>, below: Array<boolean | null> = [], days: Array<number | null> = []) =>
  depths.map((d, k) => house(lat + k * 0.00001, lng + k * 0.00001, d, below[k] ?? null, days[k] ?? null));

describe("buildFloodGrid", () => {
  it("ช่องที่มีน้อยกว่า 5 หลังไม่ถูกส่งออก (กันย้อนระบุบ้าน)", () => {
    expect(buildFloodGrid(cluster(6.99, 100.44, [100, 100, 100, 100]))).toEqual([]);
    expect(buildFloodGrid(cluster(6.99, 100.44, [100, 100, 100, 100, 100]))).toHaveLength(1);
    expect(GRID_MIN_HOUSEHOLDS).toBe(5);
  });

  it("ค่าเฉลี่ยนับเฉพาะหลังที่ตอบ · ตัวหารแยกตามตัวชี้วัด · ไม่ตัดค่าเกิน 5 ม.", () => {
    const [cell] = buildFloodGrid(cluster(6.99, 100.44, [600, 400, null, 500, 500], [true, false, true, null, true], [10, null, 20, null, null]));
    expect(cell.households).toBe(5);
    expect(cell.depthAnswered).toBe(4);
    expect(cell.avgDepthCm).toBe(500);
    expect(cell.floorAnswered).toBe(4);
    expect(cell.belowRoadPercent).toBe(75);
    expect(cell.durationAnswered).toBe(2);
    expect(cell.avgDurationDays).toBe(15);
  });

  it("ส่งออกเฉพาะกรอบช่อง ไม่มีพิกัดบ้าน · ช่องกว้างราว 200 ม.", () => {
    const [cell] = buildFloodGrid(cluster(6.99, 100.44, [50, 50, 50, 50, 50]));
    expect(Object.keys(cell).sort()).toEqual(["avgDepthCm", "avgDurationDays", "belowRoadPercent", "bounds", "depthAnswered", "durationAnswered", "floorAnswered", "households"]);
    const [s, w, n, e] = cell.bounds;
    expect((n - s) * 111_320).toBeCloseTo(200, 0);
    expect((e - w) * 111_320 * Math.cos((6.99 * Math.PI) / 180)).toBeCloseTo(200, 0);
    expect(s <= 6.99 && n > 6.99 && w <= 100.44 && e > 100.44).toBe(true);
  });

  it("พิกัดเพี้ยนถูกข้าม · ไม่มีข้อมูล → ไม่มีช่อง", () => {
    expect(buildFloodGrid([house(Number.NaN, 100, 50), house(95, 100, 50)])).toEqual([]);
    expect(buildFloodGrid([])).toEqual([]);
  });
});

describe("gridLevel / gridLegend", () => {
  const [cell] = buildFloodGrid(cluster(6.99, 100.44, [520, 520, 520, 520, 520], [true, true, true, true, false], [3, 3, 3, 3, 3]));

  it("ระดับสีตามตัวชี้วัด", () => {
    expect(gridLevel(cell, "depth")).toBe(9);
    expect(gridLevel(cell, "belowRoad")).toBe(9);
    expect(gridLevel(cell, "duration")).toBe(6);
  });

  it("ไม่มีคำตอบของตัวชี้วัดนั้น → ไม่วาด (ไม่เดาเป็น 0)", () => {
    const [blank] = buildFloodGrid(cluster(6.99, 100.44, [null, null, null, null, null]));
    expect(gridLevel(blank, "depth")).toBeNull();
    expect(gridLevel(blank, "belowRoad")).toBeNull();
  });

  it("คำอธิบายความลึกใช้ 9 ช่วงเดียวกับฮีตแมป เรียงลึกสุดก่อน", () => {
    const legend = gridLegend("depth", FLOOD_DEPTH_BINS.map((b) => ({ level: b.level, label: b.label })));
    expect(legend).toHaveLength(9);
    expect(legend[0].label).toBe("5 ม. ขึ้นไป");
  });
});
