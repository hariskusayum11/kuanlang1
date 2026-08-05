import { describe, expect, it } from "vitest";
import {
  isoToThaiDate,
  maskThaiDate,
  sanitizeDecimal,
  sanitizeIntString,
  sanitizePhone,
  thaiDateToISO,
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

describe("sanitizeDecimal", () => {
  it("จำกัดหลังจุดไม่เกิน 6 ตำแหน่ง (พิกัด GPS)", () => {
    expect(sanitizeDecimal("7.8202131")).toBe("7.820213");
    expect(sanitizeDecimal("99.943592")).toBe("99.943592");
  });

  it("ไม่ปัดค่า/ไม่เติม 0 — แค่ตัดหลักเกิน (paper-first)", () => {
    expect(sanitizeDecimal("7.8202139")).toBe("7.820213"); // ตัด ไม่ปัดขึ้น
    expect(sanitizeDecimal("7.5")).toBe("7.5");
    expect(sanitizeDecimal("7")).toBe("7");
  });

  it("รับจุดเดียว ตัดจุดเกิน และคงเครื่องหมายลบนำหน้า", () => {
    expect(sanitizeDecimal("7.82.02")).toBe("7.8202");
    expect(sanitizeDecimal("-7.820213")).toBe("-7.820213");
    expect(sanitizeDecimal("7a.8b2")).toBe("7.82");
  });
});

describe("thaiDateToISO / isoToThaiDate (ปฏิทิน ค.ศ. ↔ กระดาษ พ.ศ.)", () => {
  it("พ.ศ. → ISO ค.ศ. สำหรับ input[type=date]", () => {
    expect(thaiDateToISO("15/07/2567")).toBe("2024-07-15");
    expect(thaiDateToISO("01/02/2567")).toBe("2024-02-01");
  });

  it("ISO จากปฏิทิน → วว/ดด/ปปปป พ.ศ.", () => {
    expect(isoToThaiDate("2024-07-15")).toBe("15/07/2567");
    expect(isoToThaiDate("2024-02-01")).toBe("01/02/2567");
  });

  it("ไป-กลับได้ค่าเดิม (round-trip)", () => {
    expect(isoToThaiDate(thaiDateToISO("29/02/2567"))).toBe("29/02/2567"); // 2024 อธิกสุรทิน
  });

  it("รูปแบบผิด/วันเกินจริง → สตริงว่าง (ไม่เดา)", () => {
    expect(thaiDateToISO("31/02/2567")).toBe(""); // 31 ก.พ. ไม่มีจริง
    expect(thaiDateToISO("1/1/25")).toBe("");
    expect(thaiDateToISO("")).toBe("");
    expect(isoToThaiDate("2024/07/15")).toBe("");
    expect(isoToThaiDate("")).toBe("");
  });
});
