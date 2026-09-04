import { describe, expect, it } from "vitest";
import { groupDetails } from "../../lib/report/detail-breakdown";

describe("groupDetails — สรุป 'อื่นๆ' รายข้อความ + นับจำนวนที่ซ้ำ (ข้อ 6)", () => {
  it("นับข้อความที่ซ้ำเป็นจำนวน และเรียงจากมากไปน้อย", () => {
    const result = groupDetails(["เบาหวาน", "ความดัน", "เบาหวาน", "เบาหวาน", "ความดัน"]);
    expect(result.items).toEqual([
      { text: "เบาหวาน", count: 3 },
      { text: "ความดัน", count: 2 },
    ]);
    expect(result.withDetail).toBe(5);
    expect(result.withoutDetail).toBe(0);
    expect(result.totalRecords).toBe(5);
  });

  it("ค่าว่าง/ช่องว่าง/null นับเป็น 'ไม่ได้ระบุ' ไม่ปนกับข้อความจริง", () => {
    const result = groupDetails(["มะเร็ง", null, "", "   ", "มะเร็ง"]);
    expect(result.items).toEqual([{ text: "มะเร็ง", count: 2 }]);
    expect(result.withDetail).toBe(2);
    expect(result.withoutDetail).toBe(3);
    expect(result.totalRecords).toBe(5);
  });

  it("trim ช่องว่างหัวท้ายก่อนจับกลุ่ม — 'เบาหวาน ' กับ 'เบาหวาน' คือค่าเดียวกัน", () => {
    const result = groupDetails([" เบาหวาน ", "เบาหวาน"]);
    expect(result.items).toEqual([{ text: "เบาหวาน", count: 2 }]);
  });

  it("ไม่มีข้อมูลเลย → รายการว่าง ไม่พัง", () => {
    const result = groupDetails([]);
    expect(result.items).toEqual([]);
    expect(result.totalRecords).toBe(0);
  });

  it("จำนวนเท่ากันเรียงตามตัวอักษรไทย (ผลลัพธ์คงที่ ไม่สุ่ม)", () => {
    const result = groupDetails(["ข", "ก"]);
    expect(result.items.map((i) => i.text)).toEqual(["ก", "ข"]);
  });
});
