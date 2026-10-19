import { describe, it, expect } from "vitest";
import {
  formatRai,
  squareMetersToRai,
  summarizeVulnerableByCommunity,
  thaiShortDate,
} from "../../domain/geo/community-summary";

// กล่องข้อมูลชุมชนบนแผนที่ (docs/35)

describe("squareMetersToRai / formatRai", () => {
  it("1 ไร่ = 1,600 ตร.ม. · ปัดเป็นจำนวนเต็ม", () => {
    expect(squareMetersToRai(1600)).toBe(1);
    expect(squareMetersToRai(1_354_000)).toBeCloseTo(846.25, 2);
    expect(formatRai(846.25)).toBe("≈ 846 ไร่");
  });

  it("ไม่มีพื้นที่/ค่าเพี้ยน → ไม่ทราบ (ห้ามแสดงเป็น 0 ไร่)", () => {
    expect(squareMetersToRai(null)).toBeNull();
    expect(squareMetersToRai(0)).toBeNull();
    expect(squareMetersToRai(Number.NaN)).toBeNull();
    expect(formatRai(null)).toBe("ไม่ทราบ");
  });
});

describe("summarizeVulnerableByCommunity", () => {
  const elderly = { name: "ผู้สูงอายุ", sortOrder: 1 };
  const bedridden = { name: "ผู้ป่วยติดเตียง", sortOrder: 2 };

  it("นับคน (ไม่ใช่ประเภท) · แยกคนที่ไม่นับแล้ว · ประเภทเรียงตาม sortOrder", () => {
    const result = summarizeVulnerableByCommunity([
      { communityId: "c1", isActive: true, types: [bedridden, elderly] },
      { communityId: "c1", isActive: true, types: [elderly] },
      { communityId: "c1", isActive: false, types: [bedridden] },
      { communityId: "c2", isActive: true, types: [] },
    ]);
    expect(result.get("c1")).toEqual({
      activePersons: 2,
      inactivePersons: 1,
      byType: [
        { name: "ผู้สูงอายุ", count: 2 },
        { name: "ผู้ป่วยติดเตียง", count: 1 },
      ],
    });
    expect(result.get("c2")).toEqual({ activePersons: 1, inactivePersons: 0, byType: [] });
  });

  it("ประเภทซ้ำในคนเดียวนับครั้งเดียว · คนที่ไม่นับแล้วไม่ถูกนับในประเภท", () => {
    const result = summarizeVulnerableByCommunity([
      { communityId: "c1", isActive: true, types: [elderly, elderly] },
      { communityId: "c1", isActive: false, types: [elderly] },
    ]);
    expect(result.get("c1")?.byType).toEqual([{ name: "ผู้สูงอายุ", count: 1 }]);
  });

  it("ไม่มีข้อมูล → Map ว่าง", () => {
    expect(summarizeVulnerableByCommunity([]).size).toBe(0);
  });
});

describe("thaiShortDate", () => {
  it("ใช้เวลาไทย — 17:30 UTC เป็นวันถัดไปแล้ว", () => {
    expect(thaiShortDate(new Date("2026-10-18T17:30:00.000Z"))).toContain("19");
  });
});
