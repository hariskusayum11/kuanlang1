import { describe, it, expect } from "vitest";
import {
  bangkokToday,
  carryOverStatuses,
  checkTransition,
  displayStatusOf,
  nameKey,
  parseEventDate,
  resolveStatusScope,
  scopeAllows,
  statusColumns,
} from "../../domain/vulnerable/status";

// สถานะกลุ่มเปราะบางหลังการสำรวจ (Owner Decision 2026-10-19 · docs/34)

describe("displayStatusOf", () => {
  it("active = ปกติ · รหัสที่รู้จักแสดงตามรหัส", () => {
    expect(displayStatusOf({ isActive: true, deactivatedReason: "DECEASED" })).toBe("ACTIVE");
    expect(displayStatusOf({ isActive: false, deactivatedReason: "DECEASED" })).toBe("DECEASED");
    expect(displayStatusOf({ isActive: false, deactivatedReason: "MOVED_OUT" })).toBe("MOVED_OUT");
  });

  it("ปิดอยู่แต่ไม่มีรหัส/รหัสแปลก → ไม่เดาว่าเป็นสถานะใด", () => {
    expect(displayStatusOf({ isActive: false, deactivatedReason: null })).toBe("INACTIVE_UNKNOWN");
    expect(displayStatusOf({ isActive: false, deactivatedReason: "ย้ายออก" })).toBe("INACTIVE_UNKNOWN");
  });
});

describe("checkTransition / statusColumns", () => {
  it("เปลี่ยนเป็นสถานะเดิมไม่ได้ (กัน Audit ซ้ำ)", () => {
    expect(checkTransition("ACTIVE", "ACTIVE")).toEqual({ ok: false, reason: "UNCHANGED" });
    expect(checkTransition("DECEASED", "DECEASED")).toEqual({ ok: false, reason: "UNCHANGED" });
  });

  it("เปลี่ยนข้ามสถานะได้ และคืนสถานะได้", () => {
    expect(checkTransition("ACTIVE", "DECEASED").ok).toBe(true);
    expect(checkTransition("MOVED_OUT", "DECEASED").ok).toBe(true);
    expect(checkTransition("INACTIVE_UNKNOWN", "ACTIVE").ok).toBe(true);
  });

  it("คืนสถานะล้างค่าเหตุการณ์ทั้งหมด · ปิดสถานะเก็บรหัส วันที่ และผู้บันทึก", () => {
    expect(statusColumns("ACTIVE", null, "u1")).toEqual({
      isActive: true,
      deactivatedReason: null,
      deactivatedAt: null,
      deactivatedById: null,
    });
    const date = new Date("2026-10-01T00:00:00.000Z");
    expect(statusColumns("DECEASED", date, "u1")).toEqual({
      isActive: false,
      deactivatedReason: "DECEASED",
      deactivatedAt: date,
      deactivatedById: "u1",
    });
  });
});

describe("parseEventDate", () => {
  const today = "2026-10-19";

  it("วันนี้และวันที่ผ่านมาใช้ได้", () => {
    expect(parseEventDate("2026-10-19", today).ok).toBe(true);
    expect(parseEventDate("2024-01-31", today).ok).toBe(true);
  });

  it("วันที่ในอนาคตไม่ได้", () => {
    expect(parseEventDate("2026-10-20", today)).toEqual({ ok: false, reason: "FUTURE_DATE" });
  });

  it("ปี พ.ศ. ที่พิมพ์ลงช่อง ค.ศ. ถูกจับเป็นวันในอนาคต · ย้อนหลังเกิน 5 ปีถูกจับ", () => {
    expect(parseEventDate("2569-10-01", today)).toEqual({ ok: false, reason: "FUTURE_DATE" });
    expect(parseEventDate("2021-10-18", today)).toEqual({ ok: false, reason: "TOO_OLD" });
    expect(parseEventDate("2021-10-19", today).ok).toBe(true);
  });

  it("วันที่ไม่มีจริงหรือรูปแบบผิด", () => {
    expect(parseEventDate("2026-02-30", today)).toEqual({ ok: false, reason: "INVALID_DATE" });
    expect(parseEventDate("19/10/2026", today)).toEqual({ ok: false, reason: "INVALID_DATE" });
    expect(parseEventDate("", today)).toEqual({ ok: false, reason: "INVALID_DATE" });
  });

  it("bangkokToday ใช้เวลาไทย (UTC+7)", () => {
    expect(bangkokToday(new Date("2026-10-18T17:30:00.000Z"))).toBe("2026-10-19");
    expect(bangkokToday(new Date("2026-10-18T16:59:00.000Z"))).toBe("2026-10-18");
  });
});

describe("resolveStatusScope — ข้อยกเว้นของ #R7-B เฉพาะหน้านี้", () => {
  it("ADMIN เห็นทุกชุมชน", () => {
    const scope = resolveStatusScope(["ADMIN"], []);
    expect(scope).toEqual({ kind: "ALL" });
    expect(scopeAllows(scope, "any")).toBe(true);
  });

  it("หัวหน้าชุมชนเห็นเฉพาะชุมชนที่ผูกไว้ · ไม่ผูกเลย = ไม่เห็นอะไร", () => {
    const scope = resolveStatusScope(["COMMUNITY_LEADER"], ["c1", "c1", "c2"]);
    expect(scope).toEqual({ kind: "COMMUNITIES", communityIds: ["c1", "c2"] });
    expect(scopeAllows(scope, "c1")).toBe(true);
    expect(scopeAllows(scope, "c3")).toBe(false);
    expect(scopeAllows(resolveStatusScope(["COMMUNITY_LEADER"], []), "c1")).toBe(false);
  });
});

describe("carryOverStatuses — คงสถานะเมื่อผู้คีย์แก้ใบ", () => {
  const deceased = {
    deactivatedReason: "DECEASED",
    deactivatedAt: new Date("2026-10-01T00:00:00.000Z"),
    deactivatedById: "leader",
  };

  it("nameKey ไม่สนช่องว่างซ้ำ", () => {
    expect(nameKey(" สมศรี ", "  ใจดี")).toBe("สมศรี ใจดี");
    expect(nameKey(null, undefined)).toBe("");
  });

  it("จับคู่ด้วยชื่อ แม้ลำดับแถวเลื่อน (ผู้คีย์ลบแถวก่อนหน้า)", () => {
    const { carried, dropped } = carryOverStatuses(
      [{ seq: 3, nameKey: "สมศรี ใจดี", isActive: false, ...deceased }],
      [
        { seq: 1, nameKey: "สมชาย ใจดี" },
        { seq: 2, nameKey: "สมศรี ใจดี" },
      ],
    );
    expect(dropped).toBe(0);
    expect(carried.get(2)).toEqual(deceased);
    expect(carried.has(1)).toBe(false);
  });

  it("ไม่ย้ายสถานะไปติดคนอื่นที่อยู่ลำดับเดิม (ผิดร้ายแรงกว่าหาย)", () => {
    const { carried, dropped } = carryOverStatuses(
      [{ seq: 1, nameKey: "สมศรี ใจดี", isActive: false, ...deceased }],
      [{ seq: 1, nameKey: "สมชาย ใจดี" }],
    );
    expect(carried.size).toBe(0);
    expect(dropped).toBe(1);
  });

  it("ชื่อซ้ำในบ้าน → ไม่เดา", () => {
    const { carried, dropped } = carryOverStatuses(
      [{ seq: 1, nameKey: "สมศรี ใจดี", isActive: false, ...deceased }],
      [
        { seq: 1, nameKey: "สมศรี ใจดี" },
        { seq: 2, nameKey: "สมศรี ใจดี" },
      ],
    );
    expect(carried.size).toBe(0);
    expect(dropped).toBe(1);
  });

  it("แถวไม่มีชื่อ (อ่านไม่ออก) จับคู่ลำดับเดียวกันที่ไม่มีชื่อเหมือนกันเท่านั้น", () => {
    const prev = [{ seq: 2, nameKey: "", isActive: false, ...deceased }];
    expect(carryOverStatuses(prev, [{ seq: 2, nameKey: "" }]).carried.get(2)).toEqual(deceased);
    expect(carryOverStatuses(prev, [{ seq: 2, nameKey: "สมศรี ใจดี" }]).carried.size).toBe(0);
  });

  it("แถวที่ยัง active ไม่ถูกพิจารณา", () => {
    const { carried, dropped } = carryOverStatuses(
      [{ seq: 1, nameKey: "สมศรี ใจดี", isActive: true, deactivatedReason: null, deactivatedAt: null, deactivatedById: null }],
      [{ seq: 1, nameKey: "สมศรี ใจดี" }],
    );
    expect(carried.size).toBe(0);
    expect(dropped).toBe(0);
  });
});
