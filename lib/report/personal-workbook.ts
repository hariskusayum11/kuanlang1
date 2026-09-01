import ExcelJS from "exceljs";

/** ชีตสำคัญเท่านั้น — ข้อมูลหมวดย่อยถูกรวมเป็นคอลัมน์ ไม่แตกเป็นชีตย่อยจำนวนมาก */
export const PERSONAL_REPORT_SHEET_NAMES = [
  "00 สรุป",
  "01 ครัวเรือน",
  "02 กลุ่มเปราะบาง",
  "03 การช่วยเหลือ",
  "04 ความเสี่ยงและความพร้อม",
  "05 อาสาสมัคร",
] as const;

export type PersonalCellValue = string | number | boolean | Date | null | undefined;

export interface PersonalReportColumn {
  key: string;
  header: string;
  width?: number;
}

export interface PersonalReportSheet {
  name: string;
  title: string;
  note: string;
  columns: PersonalReportColumn[];
  rows: Array<Record<string, PersonalCellValue>>;
}

export interface PersonalWorkbookInput {
  generatedAt: Date;
  generatedBy: string;
  filterDescription: string;
  sheets: PersonalReportSheet[];
}

/** ป้องกันค่าจากแบบสอบถามถูก Excel ตีความเป็นสูตรเมื่อเปิดไฟล์ */
export function safeExcelText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "รายงาน";
  let candidate = base;
  let suffix = 1;
  while (used.has(candidate)) {
    suffix += 1;
    const marker = `_${suffix}`;
    candidate = `${base.slice(0, 31 - marker.length)}${marker}`;
  }
  used.add(candidate);
  return candidate;
}

function writeSheet(
  workbook: ExcelJS.Workbook,
  input: PersonalWorkbookInput,
  sheet: PersonalReportSheet,
  usedNames: Set<string>,
): void {
  const ws = workbook.addWorksheet(safeSheetName(sheet.name, usedNames));
  const columnCount = Math.max(sheet.columns.length, 1);
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 5 }];

  ws.mergeCells(1, 1, 1, columnCount);
  const title = ws.getCell(1, 1);
  title.value = sheet.title;
  title.font = { name: "Tahoma", size: 15, bold: true, color: { argb: "FF0B1437" } };
  title.alignment = { vertical: "middle" };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, columnCount);
  const note = ws.getCell(2, 1);
  note.value = sheet.note;
  note.font = { name: "Tahoma", size: 10, color: { argb: "FF9A3412" }, italic: true };
  note.alignment = { wrapText: true, vertical: "middle" };
  ws.getRow(2).height = 30;

  ws.mergeCells(3, 1, 3, columnCount);
  const meta = ws.getCell(3, 1);
  meta.value = `จัดทำโดย ${input.generatedBy} · ${input.generatedAt.toLocaleString("th-TH")} · ${input.filterDescription}`;
  meta.font = { name: "Tahoma", size: 9, color: { argb: "FF64748B" } };
  meta.alignment = { wrapText: true };

  const header = ws.getRow(5);
  sheet.columns.forEach((column, index) => {
    ws.getColumn(index + 1).width = column.width ?? 18;
    const cell = header.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  });
  header.height = 28;

  sheet.rows.forEach((row, rowIndex) => {
    const excelRow = ws.getRow(6 + rowIndex);
    sheet.columns.forEach((column, columnIndex) => {
      const raw = row[column.key];
      const cell = excelRow.getCell(columnIndex + 1);
      cell.value = typeof raw === "string" ? safeExcelText(raw) : raw ?? "";
      cell.font = { name: "Tahoma", size: 10 };
      cell.alignment = { vertical: "top", wrapText: true };
      if (raw instanceof Date) cell.numFmt = "dd/mm/yyyy";
      if (rowIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FF" } };
      }
    });
  });

  ws.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: columnCount },
  };
}

export async function buildPersonalReportWorkbook(input: PersonalWorkbookInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SKL-FRIS";
  workbook.created = input.generatedAt;
  workbook.modified = input.generatedAt;
  workbook.subject = "รายงานรายบุคคลจากแบบสอบถามที่ผ่านการตรวจแล้ว";

  const usedNames = new Set<string>();
  for (const sheet of input.sheets) writeSheet(workbook, input, sheet, usedNames);

  const output = await workbook.xlsx.writeBuffer();
  return Buffer.from(output);
}
