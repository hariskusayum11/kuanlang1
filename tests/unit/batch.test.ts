import { describe, expect, it } from "vitest";
import {
  MAX_SHEETS_PER_BATCH,
  parseErrorMessage,
  parseSheetNumbers,
} from "../../lib/batch/sheet-numbers";

describe("parseSheetNumbers — แปลงข้อความเลขใบตอนรับปึก", () => {
  it("ช่วงเลขพื้นฐาน: 101-105 → 5 ใบเรียงลำดับ", () => {
    const r = parseSheetNumbers("101-105");
    expect(r).toEqual({ ok: true, numbers: ["101", "102", "103", "104", "105"] });
  });

  it("คงศูนย์นำหน้าตามฝั่งซ้าย: 001-003 → 001, 002, 003", () => {
    const r = parseSheetNumbers("001-003");
    expect(r).toEqual({ ok: true, numbers: ["001", "002", "003"] });
  });

  it("ผสมได้: หลายช่วง + เลขเดี่ยว คั่นด้วย comma/เว้นวรรค/ขึ้นบรรทัด", () => {
    const r = parseSheetNumbers("101-103, 230\n412 505-506");
    expect(r).toEqual({
      ok: true,
      numbers: ["101", "102", "103", "230", "412", "505", "506"],
    });
  });

  it("เลขมีตัวอักษร/ขีดใช้ได้แบบเดี่ยว และถูก normalize เป็นตัวพิมพ์ใหญ่", () => {
    const r = parseSheetNumbers("tk-a1 tk-a2");
    expect(r).toEqual({ ok: true, numbers: ["TK-A1", "TK-A2"] });
  });

  it("เลขซ้ำ → DUPLICATE พร้อมชี้เลขที่ซ้ำ (ทั้งซ้ำตรงและซ้ำผ่านช่วง)", () => {
    expect(parseSheetNumbers("101 102 101")).toEqual({
      ok: false,
      reason: "DUPLICATE",
      offending: "101",
    });
    expect(parseSheetNumbers("101-105, 103")).toMatchObject({
      ok: false,
      reason: "DUPLICATE",
      offending: "103",
    });
  });

  it("ช่วงกลับหัว (150-101) → BAD_RANGE", () => {
    expect(parseSheetNumbers("150-101")).toMatchObject({
      ok: false,
      reason: "BAD_RANGE",
    });
  });

  it("token เพี้ยน → BAD_TOKEN ชี้ token", () => {
    expect(parseSheetNumbers("101 ??x")).toMatchObject({
      ok: false,
      reason: "BAD_TOKEN",
      offending: "??X",
    });
  });

  it(`เกินเพดาน ${MAX_SHEETS_PER_BATCH} ใบ → TOO_MANY`, () => {
    expect(parseSheetNumbers(`1-${MAX_SHEETS_PER_BATCH + 1}`)).toMatchObject({
      ok: false,
      reason: "TOO_MANY",
    });
  });

  it("ว่างเปล่า → EMPTY", () => {
    expect(parseSheetNumbers("   \n  ")).toEqual({ ok: false, reason: "EMPTY" });
  });

  it("ทุก error reason มีข้อความไทย", () => {
    for (const input of ["", "??", "9-1", "1 1", `1-${MAX_SHEETS_PER_BATCH + 1}`]) {
      const r = parseSheetNumbers(input);
      if (!r.ok) expect(parseErrorMessage(r).length).toBeGreaterThan(0);
    }
  });
});
