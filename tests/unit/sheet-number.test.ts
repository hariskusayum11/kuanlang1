import { describe, expect, it } from "vitest";
import {
  formatSheetNo,
  normalizeSheetNo,
  SHEET_NO_MAX,
  SHEET_NO_PATTERN,
} from "../../lib/sheet/number";

// รูปแบบรหัส SK-<6 หลัก> (Owner Decision 2026-08-03)
// เดินหน้าอย่างเดียว ไม่รีเซ็ต — ไม่ฝังชุมชนในรหัสเพราะชุมชนแก้ไขภายหลังได้

describe("formatSheetNo", () => {
  it("เติมศูนย์นำหน้าให้ครบ 6 หลักเสมอ", () => {
    expect(formatSheetNo(1)).toBe("SK-000001");
    expect(formatSheetNo(123)).toBe("SK-000123");
    expect(formatSheetNo(999_999)).toBe("SK-999999");
  });

  it("ผลลัพธ์ตรงรูปแบบที่ระบบยอมรับเสมอ", () => {
    for (const n of [1, 7, 42, 1000, 98_765, SHEET_NO_MAX]) {
      expect(SHEET_NO_PATTERN.test(formatSheetNo(n))).toBe(true);
    }
  });

  it("เลขนอกช่วง → โยน error ไม่ปล่อยรหัสผิดรูปลงฐานข้อมูล", () => {
    expect(() => formatSheetNo(0)).toThrow(RangeError);
    expect(() => formatSheetNo(-1)).toThrow(RangeError);
    expect(() => formatSheetNo(SHEET_NO_MAX + 1)).toThrow(RangeError);
    expect(() => formatSheetNo(1.5)).toThrow(RangeError);
  });
});

describe("normalizeSheetNo", () => {
  it("รับรหัสเต็มที่ถูกต้อง", () => {
    expect(normalizeSheetNo("SK-000123")).toBe("SK-000123");
  });

  it("ตัวพิมพ์เล็กและช่องว่างหัวท้าย → normalize ให้ (พิมพ์จากกระดาษ)", () => {
    expect(normalizeSheetNo("  sk-000123  ")).toBe("SK-000123");
    expect(normalizeSheetNo("Sk-000123")).toBe("SK-000123");
  });

  it("ลืมขีด → เติมให้", () => {
    expect(normalizeSheetNo("SK000123")).toBe("SK-000123");
    expect(normalizeSheetNo("sk000123")).toBe("SK-000123");
  });

  it("พิมพ์เฉพาะตัวเลข → เติม SK- และศูนย์นำหน้าให้", () => {
    expect(normalizeSheetNo("123")).toBe("SK-000123");
    expect(normalizeSheetNo("000123")).toBe("SK-000123");
    expect(normalizeSheetNo("1")).toBe("SK-000001");
  });

  it("รูปแบบที่รับไม่ได้ → null (ไม่เดาให้)", () => {
    expect(normalizeSheetNo("")).toBeNull();
    expect(normalizeSheetNo("   ")).toBeNull();
    expect(normalizeSheetNo("0")).toBeNull(); // เลข 0 ไม่มีในระบบ
    expect(normalizeSheetNo("1234567")).toBeNull(); // เกิน 6 หลัก
    expect(normalizeSheetNo("SK-12345")).toBeNull(); // ไม่ครบ 6 หลัก
    expect(normalizeSheetNo("TK-000123")).toBeNull(); // prefix อื่น
    expect(normalizeSheetNo("SHEET-TK01-001")).toBeNull(); // รหัสรูปแบบเดิม
    expect(normalizeSheetNo("SK-00012A")).toBeNull();
  });

  it("normalize แล้วต้องตรงกับ formatSheetNo ของเลขเดียวกัน", () => {
    for (const n of [1, 99, 4567, 123_456]) {
      expect(normalizeSheetNo(String(n))).toBe(formatSheetNo(n));
    }
  });
});
