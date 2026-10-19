import { describe, it, expect } from "vitest";
import { depthBin, FLOOD_DEPTH_BINS, heatVar } from "../../domain/flood/depth-scale";
import { highestUrgency, MAP_URGENCY_LABELS, MAP_URGENCY_ORDER } from "../../domain/geo/map-urgency";
import { filterAndSortUsers, parseUserListFilter } from "../../domain/admin/user-list-filter";

// งานระยะ 1 หลังประชุม (Owner Decision 2026-10-19)

describe("ฮีตแมประดับน้ำ 9 ช่วง", () => {
  it("ช่วงต่อเนื่อง ไม่มีรู ไม่ซ้อน และช่วงสุดท้ายไม่มีเพดาน", () => {
    expect(FLOOD_DEPTH_BINS).toHaveLength(9);
    for (let i = 1; i < FLOOD_DEPTH_BINS.length; i += 1) {
      expect(FLOOD_DEPTH_BINS[i].minCm).toBe(FLOOD_DEPTH_BINS[i - 1].maxCm);
    }
    expect(FLOOD_DEPTH_BINS.at(-1)?.maxCm).toBeNull();
  });

  it("แยก 1 ม. กับ 5 ม. ออกจากกัน (เดิมเป็นสีเดียวกันตั้งแต่ 1.5 ม.)", () => {
    expect(depthBin(100)?.level).toBe(4);
    expect(depthBin(160)?.level).toBe(5);
    expect(depthBin(350)?.level).toBe(7);
    expect(depthBin(499)?.level).toBe(8);
    expect(depthBin(500)?.level).toBe(9);
    // ระดับน้ำเกิน 5 ม. เป็นข้อมูลจริง ต้องไม่ถูกตัดทิ้ง
    expect(depthBin(800)?.level).toBe(9);
  });

  it("ขอบช่วง: ค่าล่างรวม ค่าบนไม่รวม · ค่าเพี้ยนไม่วาด", () => {
    expect(depthBin(0)?.level).toBe(1);
    expect(depthBin(29.9)?.level).toBe(1);
    expect(depthBin(30)?.level).toBe(2);
    expect(depthBin(null)).toBeNull();
    expect(depthBin(-5)).toBeNull();
    expect(depthBin(Number.NaN)).toBeNull();
    expect(heatVar(3)).toBe("--heat-3");
  });
});

describe("สีหมุดบ้านตามความเร่งด่วน", () => {
  const t = (P1: number, P2: number, P3: number, UNASSESSED: number) => ({ P1, P2, P3, UNASSESSED });

  it("เลือกระดับที่เร่งด่วนที่สุดของทุกบ้านในพิกัดเดียวกัน", () => {
    expect(highestUrgency([t(0, 0, 2, 0), t(1, 0, 0, 0)])).toBe("critical");
    expect(highestUrgency([t(0, 1, 3, 2)])).toBe("urgent");
    expect(highestUrgency([t(0, 0, 1, 1)])).toBe("watch");
    expect(highestUrgency([t(0, 0, 0, 2)])).toBe("unknown");
    expect(highestUrgency([t(0, 0, 0, 0)])).toBeNull();
    expect(highestUrgency([])).toBeNull();
  });

  it("คำอธิบายเป็นภาษาคน ไม่มีรหัส P1–P3 (เจ้าของระบบ: ดูไม่เข้าใจ)", () => {
    for (const level of MAP_URGENCY_ORDER) expect(MAP_URGENCY_LABELS[level]).not.toMatch(/P[123]/);
  });
});

describe("ตัวกรองหน้าผู้ใช้และสิทธิ์", () => {
  const roles = ["ADMIN", "OFFICER", "DATA_ENTRY"];
  const users = [
    { name: "สมชาย", email: "a@x.test", roles: ["OFFICER"], accountStatus: "ACTIVE" as const, createdAt: new Date("2026-08-01"), lastLoginAt: new Date("2026-10-18") },
    { name: "กนกพร", email: "b@x.test", roles: ["DATA_ENTRY"], accountStatus: "PENDING_APPROVAL" as const, createdAt: new Date("2026-10-10"), lastLoginAt: null },
    { name: "ดวงใจ", email: "c@x.test", roles: ["ADMIN", "OFFICER"], accountStatus: "ACTIVE" as const, createdAt: new Date("2026-07-01"), lastLoginAt: new Date("2026-10-19") },
  ];

  it("ค่าแปลกปลอมจาก URL กลับเป็นค่าเริ่มต้น · ค่าเริ่มต้นเรียงสมัครล่าสุดก่อน", () => {
    const f = parseUserListFilter({ role: "HACKER", status: "X", sort: "drop table" }, roles);
    expect(f).toEqual({ q: "", role: null, status: null, sort: "newest" });
    expect(filterAndSortUsers(users, f).map((u) => u.name)).toEqual(["กนกพร", "สมชาย", "ดวงใจ"]);
  });

  it("ค้นชื่อ/อีเมล · กรองบทบาท · กรองสถานะ", () => {
    expect(filterAndSortUsers(users, parseUserListFilter({ q: "c@x" }, roles)).map((u) => u.name)).toEqual(["ดวงใจ"]);
    expect(filterAndSortUsers(users, parseUserListFilter({ role: "OFFICER" }, roles))).toHaveLength(2);
    expect(filterAndSortUsers(users, parseUserListFilter({ status: "PENDING_APPROVAL" }, roles)).map((u) => u.name)).toEqual(["กนกพร"]);
  });

  it("เรียงตามเข้าใช้ล่าสุด — คนที่ไม่เคยเข้าใช้อยู่ท้าย", () => {
    const sorted = filterAndSortUsers(users, parseUserListFilter({ sort: "last-login" }, roles));
    expect(sorted.map((u) => u.name)).toEqual(["ดวงใจ", "สมชาย", "กนกพร"]);
  });
});
