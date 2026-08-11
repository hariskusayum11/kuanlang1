import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  normalizePage,
  normalizePageSize,
} from "../../lib/pagination";

describe("pagination", () => {
  it("รองรับจำนวนต่อหน้าเฉพาะ 20/50/100", () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([20, 50, 100]);
    expect(normalizePageSize(20)).toBe(20);
    expect(normalizePageSize("50")).toBe(50);
    expect(normalizePageSize(100)).toBe(100);
  });

  it("ค่าจำนวนต่อหน้าที่ไม่รองรับกลับไปใช้ค่าเริ่มต้น", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    expect(normalizePageSize(0)).toBe(20);
    expect(normalizePageSize(21)).toBe(20);
    expect(normalizePageSize("abc")).toBe(20);
  });

  it("เลขหน้าต้องเป็นจำนวนเต็มบวก", () => {
    expect(normalizePage("3")).toBe(3);
    expect(normalizePage(2.9)).toBe(2);
    expect(normalizePage(0)).toBe(1);
    expect(normalizePage(-1)).toBe(1);
    expect(normalizePage("abc")).toBe(1);
  });
});
