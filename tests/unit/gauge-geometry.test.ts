import { describe, expect, it } from "vitest";
import {
  clampPercent,
  gaugeArc,
  percentToAngle,
  polarPoint,
  targetTick,
} from "../../domain/coverage/gauge-geometry";

describe("clampPercent", () => {
  it("บีบค่าให้อยู่ในช่วง 0–100", () => {
    expect(clampPercent(-5)).toBe(0);
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(63.4)).toBe(63.4);
    expect(clampPercent(140)).toBe(100);
  });

  it("ค่าเพี้ยน (NaN/Infinity) คืน 0 ไม่ใช่ 100 — ห้ามให้เกจโชว์ว่าผ่านเป้าจากข้อมูลที่เชื่อถือไม่ได้", () => {
    expect(clampPercent(Number.NaN)).toBe(0);
    expect(clampPercent(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampPercent(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe("percentToAngle", () => {
  it("0% อยู่ซ้ายสุด (180°) และ 100% อยู่ขวาสุด (0°)", () => {
    expect(percentToAngle(0)).toBe(180);
    expect(percentToAngle(100)).toBe(0);
  });

  it("50% อยู่บนสุดพอดี (90°)", () => {
    expect(percentToAngle(50)).toBe(90);
  });

  it("ค่าเกิน 100 ไม่ทำให้เข็มวนเลยขวาสุด", () => {
    expect(percentToAngle(150)).toBe(0);
  });

  it("ทุกค่าใน 0–100 ให้มุมอยู่ในช่วง 0–180 เสมอ", () => {
    for (let p = 0; p <= 100; p += 5) {
      const a = percentToAngle(p);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(180);
    }
  });
});

describe("polarPoint", () => {
  it("มุม 0° อยู่ขวาของจุดศูนย์ และ 90° อยู่เหนือจุดศูนย์ (y ชี้ลงแบบ SVG)", () => {
    expect(polarPoint(50, 52, 40, 0)).toEqual({ x: 90, y: 52 });
    expect(polarPoint(50, 52, 40, 90)).toEqual({ x: 50, y: 12 });
    expect(polarPoint(50, 52, 40, 180)).toEqual({ x: 10, y: 52 });
  });
});

describe("gaugeArc", () => {
  it("0% คืน path ว่าง — ไม่ให้เกิดจุดทึบค้างบนเกจ", () => {
    const arc = gaugeArc(50, 52, 40, 0);
    expect(arc.d).toBe("");
    expect(arc.end).toEqual({ x: 10, y: 52 });
  });

  it("100% กวาดจากซ้ายสุดถึงขวาสุด", () => {
    const arc = gaugeArc(50, 52, 40, 100);
    expect(arc.d).toBe("M 10 52 A 40 40 0 0 1 90 52");
    expect(arc.clampedPercent).toBe(100);
  });

  it("ค่าเกิน 100 ถูก clamp ทั้งใน path และใน clampedPercent", () => {
    const over = gaugeArc(50, 52, 40, 175);
    expect(over.clampedPercent).toBe(100);
    expect(over.d).toBe(gaugeArc(50, 52, 40, 100).d);
  });

  it("path ไม่มี NaN แม้ได้รับค่าเพี้ยน", () => {
    expect(gaugeArc(50, 52, 40, Number.NaN).d).toBe("");
  });

  it("ยิ่งเปอร์เซ็นต์มาก ปลายส่วนโค้งยิ่งเลื่อนไปทางขวา", () => {
    const xs = [10, 30, 60, 90].map((p) => gaugeArc(50, 52, 40, p).end.x);
    const sorted = [...xs].sort((a, b) => a - b);
    expect(xs).toEqual(sorted);
  });
});

describe("targetTick", () => {
  it("ขีดเป้าพาดขวางรางที่ตำแหน่งเป้าหมาย (60% อยู่ซ้ายของกลางเล็กน้อย)", () => {
    const tick = targetTick(50, 52, 40, 11, 60);
    // 60% → มุม 72° → อยู่เหนือและเยื้องขวาจากกึ่งกลางแนวตั้ง
    expect(tick.from.x).toBeGreaterThan(50);
    expect(tick.to.x).toBeGreaterThan(50);
    // ขีดต้องพาดจากด้านในออกด้านนอกของราง
    const inner = Math.hypot(tick.from.x - 50, tick.from.y - 52);
    const outer = Math.hypot(tick.to.x - 50, tick.to.y - 52);
    expect(inner).toBeLessThan(outer);
  });

  it("เป้า 50% วางขีดไว้บนสุดพอดี", () => {
    const tick = targetTick(50, 52, 40, 11, 50);
    expect(tick.from.x).toBe(50);
    expect(tick.to.x).toBe(50);
  });
});
