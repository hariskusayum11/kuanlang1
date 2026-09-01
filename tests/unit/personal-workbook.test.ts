import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildPersonalReportWorkbook,
  PERSONAL_REPORT_SHEET_NAMES,
  safeExcelText,
  type PersonalWorkbookInput,
} from "../../lib/report/personal-workbook";

describe("personal report workbook", () => {
  it("คงเหลือเฉพาะ 6 ชีตสำคัญตามลำดับใช้งาน", () => {
    expect(PERSONAL_REPORT_SHEET_NAMES).toEqual([
      "00 สรุป",
      "01 ครัวเรือน",
      "02 กลุ่มเปราะบาง",
      "03 การช่วยเหลือ",
      "04 ความเสี่ยงและความพร้อม",
      "05 อาสาสมัคร",
    ]);
  });

  it("ป้องกันข้อความที่อาจถูก Excel ตีความเป็นสูตร", () => {
    expect(safeExcelText("=HYPERLINK(\"bad\")")).toBe("'=HYPERLINK(\"bad\")");
    expect(safeExcelText("+66812345678")).toBe("'+66812345678");
    expect(safeExcelText("นายสมชาย")).toBe("นายสมชาย");
  });

  it("สร้างหลายชีตและคงคำอธิบายตัวบุคคลไว้ในไฟล์", async () => {
    const input: PersonalWorkbookInput = {
      generatedAt: new Date("2026-08-28T00:00:00.000Z"),
      generatedBy: "ผู้บริหารทดสอบ",
      filterDescription: "เฉพาะใบตรวจแล้ว",
      sheets: [
        {
          name: "01 ครัวเรือน",
          title: "ทะเบียนครัวเรือนและผู้ให้ข้อมูล",
          note: "ชื่อในชีตนี้คือผู้ให้ข้อมูล ไม่ใช่ผู้รับความช่วยเหลือ",
          columns: [
            { key: "sheetNo", header: "รหัสแบบสอบถาม" },
            { key: "respondent", header: "ชื่อผู้ให้ข้อมูล" },
          ],
          rows: [{ sheetNo: "SK-1", respondent: "=ชื่ออันตราย" }],
        },
        {
          name: "02 กลุ่มเปราะบาง",
          title: "รายชื่อบุคคลกลุ่มเปราะบาง",
          note: "คอลัมน์นี้เป็นชื่อบุคคลจริงในกลุ่มเปราะบาง",
          columns: [{ key: "name", header: "ชื่อบุคคลกลุ่มเปราะบาง" }],
          rows: [{ name: "เด็กชายทดสอบ" }],
        },
      ],
    };

    const buffer = await buildPersonalReportWorkbook(input);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "01 ครัวเรือน",
      "02 กลุ่มเปราะบาง",
    ]);
    expect(workbook.getWorksheet("01 ครัวเรือน")?.getCell("A2").value).toContain("ผู้ให้ข้อมูล");
    expect(workbook.getWorksheet("01 ครัวเรือน")?.getCell("B6").value).toBe("'=ชื่ออันตราย");
    expect(workbook.getWorksheet("02 กลุ่มเปราะบาง")?.getCell("A5").value).toBe("ชื่อบุคคลกลุ่มเปราะบาง");
  });
});
