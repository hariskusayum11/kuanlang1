// กลุ่มเปราะบางสีแดง → ไฟล์ Excel สำหรับเคลื่อนย้าย (docs/42)
// -----------------------------------------------------------------------------
// ⚠️ ไฟล์มีชื่อ เบอร์ และพิกัดรายบ้าน (Owner Decision 2026-10-26 ข้อ 4 เปิดให้หัวหน้าชุมชน)
// ตัวเรียกต้องตรวจ RED_GROUP_VIEW + ขอบเขตชุมชน และเขียน Audit EXPORT ก่อนส่งไฟล์
// ไม่มีรายละเอียดโรคดิบ — มีแค่ชื่อประเภทที่ติ๊ก + หมายเหตุที่สรุปจากกฎ (domain/vulnerable/red-group.ts)
import ExcelJS from "exceljs";
import { decryptText, type Keyring } from "../crypto/encryption";
import { assemblePersonName, formatAge, safeSheetName } from "../report/vulnerable-export";
import {
  RED_GROUP_LABELS,
  RED_GROUP_NO,
  RED_GROUP_RULES,
  RED_GROUPS,
  redGroupNumbers,
  type RedGroup,
} from "../../domain/vulnerable/red-group";
import type { RedGroupResult, RedPersonRow } from "./core";

export interface RedExportRow {
  community: string;
  groups: RedGroup[];
  groupNumbers: string;
  groupNames: string;
  fullName: string;
  ageText: string;
  types: string;
  notes: string;
  needsCheck: boolean;
  medicalEquipment: boolean;
  phone: string;
  address: string;
  coord: string;
  mapUrl: string | null;
  sheetNo: string;
}

function formatAddress(row: Pick<RedPersonRow, "houseNo" | "mooNo" | "soi" | "road" | "tambonName">): string {
  return [
    row.houseNo ? `บ้านเลขที่ ${row.houseNo}` : "",
    row.mooNo ? `หมู่ ${row.mooNo}` : "",
    row.soi ? `ซอย ${row.soi}` : "",
    row.road ? `ถนน ${row.road}` : "",
    row.tambonName ? `ต.${row.tambonName}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** ลิงก์นำทาง — มีแค่พิกัด ไม่มีชื่อหรือข้อมูลอื่นใน URL */
export function navigationUrl(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(7)},${lng.toFixed(7)}`;
}

/** ถอดรหัสชื่อ/เบอร์ แล้วแปลงเป็นแถวของไฟล์ — เบอร์คนนั้นก่อน ไม่มีจึงใช้เบอร์ผู้ให้ข้อมูล */
export function toExportRows(rows: readonly RedPersonRow[], keyring: Keyring): RedExportRow[] {
  const decrypt = (value: string | null): string => {
    if (!value) return "";
    try {
      return decryptText(value, keyring);
    } catch {
      return "(ถอดรหัสไม่ได้)";
    }
  };
  return rows.map((row) => {
    const personPhone = decrypt(row.encrypted.phone);
    const respondentPhone = decrypt(row.respondentPhoneEncrypted);
    const groups = row.classification.groups;
    return {
      community: row.communityName,
      groups,
      groupNumbers: redGroupNumbers(groups),
      groupNames: groups.map((g) => RED_GROUP_LABELS[g]).join(" · "),
      fullName: assemblePersonName(row.prefix, decrypt(row.encrypted.firstName), decrypt(row.encrypted.lastName), row.nameStatus),
      ageText: formatAge(row.age, row.ageMonths),
      types: row.typeNames.join(" · "),
      notes: row.classification.notes.join(" · "),
      needsCheck: row.classification.needsCheck,
      medicalEquipment: row.needsMedicalEquipment,
      phone: personPhone || (respondentPhone ? `${respondentPhone} (ผู้ให้ข้อมูล)` : ""),
      address: formatAddress(row),
      coord: row.lat !== null && row.lng !== null ? `${row.lat}, ${row.lng}` : (row.coordinateRawText ?? ""),
      mapUrl: navigationUrl(row.lat, row.lng),
      sheetNo: row.sheetNo,
    };
  });
}

type ColumnKey = keyof RedExportRow | "index";
const COLUMNS: Array<{ key: ColumnKey; header: string; width: number; center?: boolean }> = [
  { key: "index", header: "ลำดับ", width: 7, center: true },
  { key: "groupNumbers", header: "กลุ่ม", width: 8, center: true },
  { key: "groupNames", header: "กลุ่มสีแดง", width: 26 },
  { key: "fullName", header: "ชื่อ - นามสกุล", width: 26 },
  { key: "ageText", header: "อายุ", width: 10, center: true },
  { key: "phone", header: "เบอร์ติดต่อ", width: 22 },
  { key: "address", header: "ที่อยู่", width: 36 },
  { key: "mapUrl", header: "นำทาง", width: 14, center: true },
  { key: "coord", header: "พิกัด (lat, lng)", width: 24 },
  { key: "types", header: "ลักษณะที่ติ๊กในแบบสอบถาม", width: 34 },
  { key: "medicalEquipment", header: "บ้านแจ้งต้องเคลื่อนย้ายอุปกรณ์การแพทย์", width: 18, center: true },
  { key: "notes", header: "หมายเหตุ / เงื่อนไขที่พบ", width: 46 },
  { key: "needsCheck", header: "ควรโทรยืนยัน", width: 12, center: true },
  { key: "community", header: "ชุมชน", width: 20 },
  { key: "sheetNo", header: "รหัสแบบสอบถาม", width: 14, center: true },
];

const FONT = "Tahoma";

function cellValue(row: RedExportRow, key: ColumnKey, index: number): ExcelJS.CellValue {
  switch (key) {
    case "index":
      return index + 1;
    case "medicalEquipment":
      return row.medicalEquipment ? "ใช่" : "-";
    case "needsCheck":
      return row.needsCheck ? "ควรโทร" : "-";
    case "mapUrl":
      return row.mapUrl ? { text: "เปิดแผนที่", hyperlink: row.mapUrl } : "-";
    default:
      return (row[key] as string) || "-";
  }
}

function fillListSheet(ws: ExcelJS.Worksheet, title: string, subtitle: string, rows: RedExportRow[]): void {
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 4, xSplit: 4 }];
  const ncol = COLUMNS.length;
  ws.mergeCells(1, 1, 1, ncol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: FONT, size: 14, bold: true, color: { argb: "FF0B1437" } };
  ws.getRow(1).height = 26;
  ws.mergeCells(2, 1, 2, ncol);
  const sub = ws.getCell(2, 1);
  sub.value = subtitle;
  sub.font = { name: FONT, size: 10, color: { argb: "FF475569" } };

  const header = ws.getRow(4);
  header.height = 36;
  COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB91C1C" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  if (rows.length === 0) {
    ws.mergeCells(5, 1, 5, ncol);
    const empty = ws.getCell(5, 1);
    empty.value = "ไม่มีรายชื่อกลุ่มสีแดงในข้อมูลที่ตรวจแล้วของชุมชนนี้";
    empty.font = { name: FONT, size: 11, italic: true, color: { argb: "FF64748B" } };
    return;
  }

  rows.forEach((row, idx) => {
    const r = ws.getRow(5 + idx);
    COLUMNS.forEach((col, i) => {
      const cell = r.getCell(i + 1);
      cell.value = cellValue(row, col.key, idx);
      cell.font =
        col.key === "mapUrl" && row.mapUrl
          ? { name: FONT, size: 11, underline: true, color: { argb: "FF2563EB" } }
          : { name: FONT, size: 11 };
      cell.alignment = { vertical: "top", horizontal: col.center ? "center" : "left", wrapText: true };
      // แถวที่ควรโทรยืนยัน = สีเหลือง (Warning ตาม Design System) ไม่ใช่สีแดง
      if (row.needsCheck) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7D6" } };
      else if (idx % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FF" } };
    });
  });
}

function fillSummarySheet(
  ws: ExcelJS.Worksheet,
  result: Pick<RedGroupResult, "tally" | "communities">,
  rowsByCommunity: Map<string, RedExportRow[]>,
  generatedAt: Date,
): void {
  ws.views = [{ showGridLines: false }];
  ws.getColumn(1).width = 30;
  for (let c = 2; c <= 8; c += 1) ws.getColumn(c).width = 16;

  const title = ws.getCell(1, 1);
  title.value = "กลุ่มเปราะบางสีแดง — ต้องเคลื่อนย้ายเมื่อได้รับสัญญาณ (เช่น ธงส้ม)";
  title.font = { name: FONT, size: 14, bold: true, color: { argb: "FF0B1437" } };
  const when = ws.getCell(2, 1);
  when.value = `ข้อมูล ณ ${generatedAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "long", timeStyle: "short" })} · เฉพาะแบบสอบถามที่ตรวจแล้ว · ไม่นับคนที่บันทึกว่าเสียชีวิต/ย้ายออก/ไม่เข้าเกณฑ์แล้ว`;
  when.font = { name: FONT, size: 10, color: { argb: "FF475569" } };

  const headers = ["ชุมชน", ...RED_GROUPS.map((g) => `${RED_GROUP_NO[g]}. ${RED_GROUP_LABELS[g]}`), "รวม (คน)", "ควรโทรยืนยัน"];
  const headerRow = ws.getRow(4);
  headerRow.height = 36;
  headers.forEach((text, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = text;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB91C1C" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  let r = 5;
  const writeRow = (label: string, rows: RedExportRow[], bold = false) => {
    const row = ws.getRow(r);
    const values = [
      label,
      ...RED_GROUPS.map((g) => rows.filter((item) => item.groups.includes(g)).length),
      rows.length,
      rows.filter((item) => item.needsCheck).length,
    ];
    values.forEach((value, i) => {
      const cell = row.getCell(i + 1);
      cell.value = value;
      cell.font = { name: FONT, size: 11, bold };
      cell.alignment = { horizontal: i === 0 ? "left" : "center" };
    });
    r += 1;
  };
  for (const community of result.communities) writeRow(community.nameTh, rowsByCommunity.get(community.nameTh) ?? []);
  writeRow("รวมทุกชุมชนในสิทธิ์", [...rowsByCommunity.values()].flat(), true);

  r += 1;
  const notes = [
    "เกณฑ์ (Owner Decision 2026-10-26):",
    `1. ผู้ป่วยติดเตียงทุกคน — คอลัมน์ "บ้านแจ้งต้องเคลื่อนย้ายอุปกรณ์การแพทย์" มาจากข้อความช่วยเหลือระดับบ้าน`,
    "2. ผู้ป่วยที่ต้องฟอกไต",
    `3. หญิงตั้งครรภ์ที่อายุครรภ์ ณ วันนี้ ≥ ${RED_GROUP_RULES.nearTermWeeks} สัปดาห์ · มารดาหลังคลอดและทารกอายุ ≤ ${RED_GROUP_RULES.newbornMaxMonths} เดือน (นับต่อจากวันสำรวจ)`,
    `4. ผู้สูงอายุ ${RED_GROUP_RULES.elderlyAge} ปีขึ้นไปที่ติดเตียงทุกคน รวมถึงที่เขียนเรื่องติดเตียง/สายยางไว้ในช่องอื่นๆ`,
    "แถวสีเหลือง = เข้ากลุ่มจากข้อความที่เขียนในกระดาษหรืออ่านอายุไม่ได้ ควรโทรยืนยันก่อน",
    "หนึ่งคนอยู่ได้หลายกลุ่ม ยอดรายกลุ่มจึงรวมเกินจำนวนคนได้",
    "⚠️ ไฟล์นี้มีข้อมูลส่วนบุคคลและข้อมูลสุขภาพ ใช้เพื่อการช่วยเหลือเท่านั้น ห้ามส่งต่อในกลุ่มสาธารณะ",
  ];
  for (const text of notes) {
    const cell = ws.getCell(r, 1);
    cell.value = text;
    cell.font = { name: FONT, size: 10, bold: text.startsWith("เกณฑ์") || text.startsWith("⚠️"), color: { argb: text.startsWith("⚠️") ? "FFB91C1C" : "FF334155" } };
    r += 1;
  }
}

/** workbook: "สรุป" + "ทั้งหมด" (ถ้ามีหลายชุมชน) + หนึ่งชีตต่อชุมชนในสิทธิ์ (รวมชุมชนที่ไม่มีรายชื่อ) */
export async function buildRedGroupWorkbook(
  result: Pick<RedGroupResult, "tally" | "communities">,
  rows: RedExportRow[],
  generatedAt: Date = new Date(),
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SKL-FRIS";
  wb.created = generatedAt;

  const rowsByCommunity = new Map<string, RedExportRow[]>();
  for (const row of rows) {
    const list = rowsByCommunity.get(row.community) ?? [];
    list.push(row);
    rowsByCommunity.set(row.community, list);
  }

  const used = new Set<string>(["สรุป", "ทั้งหมด"]);
  fillSummarySheet(wb.addWorksheet("สรุป"), result, rowsByCommunity, generatedAt);
  const subtitle = (list: RedExportRow[]) =>
    `${list.length.toLocaleString("th-TH")} คน · แถวสีเหลือง = ควรโทรยืนยัน · กด "เปิดแผนที่" เพื่อนำทาง`;
  if (result.communities.length > 1) {
    fillListSheet(wb.addWorksheet("ทั้งหมด"), "กลุ่มเปราะบางสีแดง — ทุกชุมชน", subtitle(rows), rows);
  }
  for (const community of result.communities) {
    const list = rowsByCommunity.get(community.nameTh) ?? [];
    fillListSheet(wb.addWorksheet(safeSheetName(community.nameTh, used)), `กลุ่มเปราะบางสีแดง — ${community.nameTh}`, subtitle(list), list);
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
