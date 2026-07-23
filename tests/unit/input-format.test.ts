import { describe, expect, it } from "vitest";
import {
  maskThaiDate,
  sanitizeIntString,
  sanitizePhone,
} from "../../lib/entry/input-format";

describe("sanitizePhone", () => {
  it("รับเฉพาะตัวเลข ตัดอักขระอื่นทิ้ง", () => {
    expect(sanitizePhone("08x1-234 567")).toBe("081234567");
  });

  it("ตัดที่ 10 หลัก (เบอร์ไทยยาวสุด 10 หลัก) — กันกรอกล้น", () => {
    expect(sanitizePhone("08123456789999")).toBe("0812345678");
    expect(sanitizePhone("0812345678").length).toBe(10);
  });

  it("ค่าว่าง/ไม่มีตัวเลข = สตริงว่าง", () => {
    expect(sanitizePhone("")).toBe("");
    expect(sanitizePhone("abc-def")).toBe("");
  });
});

describe("sanitizeIntString", () => {
  it("คงเฉพาะจำนวนเต็มไม่ติดลบ ตัดจุดทศนิยม/เครื่องหมาย", () => {
    expect(sanitizeIntString("12.5")).toBe("125");
    expect(sanitizeIntString("-3")).toBe("3");
    expect(sanitizeIntString("007")).toBe("7"); // ตัด leading zero ผ่าน parseInt
  });

  it("clamp ด้วย max เมื่อกำหนด", () => {
    expect(sanitizeIntString("999", 120)).toBe("120");
    expect(sanitizeIntString("50", 120)).toBe("50");
  });

  it("ค่าว่าง/ไม่มีตัวเลข = สตริงว่าง (controlled input ยังลบได้)", () => {
    expect(sanitizeIntString("")).toBe("");
    expect(sanitizeIntString("abc")).toBe("");
  });
});

describe("maskThaiDate", () => {
  it("ใส่ / อัตโนมัติแบบ วว/ดด/ปปปป", () => {
    expect(maskThaiDate("01")).toBe("01");
    expect(maskThaiDate("0102")).toBe("01/02");
    expect(maskThaiDate("01022567")).toBe("01/02/2567");
  });

  it("รับเฉพาะตัวเลข สูงสุด 8 หลัก (2+2+4)", () => {
    expect(maskThaiDate("01/02/2567")).toBe("01/02/2567");
    expect(maskThaiDate("010225679999")).toBe("01/02/2567");
  });

  it("ค่าว่าง = สตริงว่าง", () => {
    expect(maskThaiDate("")).toBe("");
  });
});
