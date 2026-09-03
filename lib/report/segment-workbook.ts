// สร้างไฟล์ Excel รายชื่อ "ครัวเรือน" ของ segment (Drill-down export)
// -----------------------------------------------------------------------------
// สไตล์เดียวกับ vulnerable-export (หัวสีแบรนด์ · แถบสลับสี · ตรึงหัวตาราง)
// เป็น pure function รับ rows ที่ถอดรหัสแล้ว → Buffer (ทดสอบได้โดยไม่ต้องมี DB/key)
import ExcelJS from "exceljs";
import type { HouseholdSegmentRow } from "./segment-data";

type ColKey = keyof HouseholdSegmentRow | "index";
interface Col {
  key: ColKey;
  header: string;
  width: number;
  center?: boolean;
}

const BASE_COLUMNS: Col[] = [
  { key: "index", header: "ลำดับ", width: 8, center: true },
  { key: "respondentName", header: "ชื่อผู้ให้ข้อมูล", width: 26 },
  { key: "respondentPhone", header: "เบอร์โทร", width: 16, center: true },
  { key: "houseNo", header: "บ้านเลขที่", width: 12, center: true },
  { key: "mooNo", header: "หมู่", width: 8, center: true },
  { key: "soi", header: "ซอย", width: 16 },
  { key: "road", header: "ถนน", width: 16 },
  { key: "tambon", header: "ตำบล", width: 16 },
  { key: "community", header: "ชุมชน", width: 22 },
  { key: "coord", header: "พิกัด (lat, lng)", width: 24 },
  { key: "surveyedAt", header: "วันที่สำรวจ", width: 14, center: true },
  { key: "sheetNo", header: "รหัสแบบสอบถาม", width: 18 },
  { key: "status", header: "สถานะข้อมูล", width: 16, center: true },
];

const DETAIL_COLUMN: Col = { key: "detail", header: "รายละเอียด (อื่นๆ)", width: 36 };

/** สร้าง workbook ชีตเดียว (ครัวเรือน) — withDetail = true เพื่อโชว์คอลัมน์รายละเอียด "อื่นๆ" */
export async function buildHouseholdSegmentWorkbook(
  title: string,
  rows: HouseholdSegmentRow[],
  withDetail: boolean,
): Promise<Buffer> {
  const columns = withDetail ? [...BASE_COLUMNS, DETAIL_COLUMN] : BASE_COLUMNS;
  const wb = new ExcelJS.Workbook();
  wb.creator = "SKL-FRIS";
  wb.created = new Date();
  const ws = wb.addWorksheet("รายชื่อ");
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 4 }];
  const ncol = columns.length;

  ws.mergeCells(1, 1, 1, ncol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Tahoma", size: 14, bold: true, color: { argb: "FF0B1437" } };
  ws.getRow(1).height = 26;

  const subCell = ws.getCell(2, 1);
  subCell.value = `จำนวน: ${rows.length} ครัวเรือน`;
  subCell.font = { name: "Tahoma", size: 10, color: { argb: "FF475569" } };

  const headerRow = ws.getRow(4);
  columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: "Tahoma", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  rows.forEach((row, idx) => {
    const r = ws.getRow(5 + idx);
    columns.forEach((col, i) => {
      const cell = r.getCell(i + 1);
      cell.value = col.key === "index" ? idx + 1 : (row[col.key] as string) || "-";
      cell.font = { name: "Tahoma", size: 11 };
      cell.alignment = { vertical: "middle", horizontal: col.center ? "center" : "left", wrapText: true };
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FF" } };
      }
    });
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
