// รายชื่อกลุ่มเปราะบางทั้งหมด (แยกชุมชน) → ไฟล์ Excel สำหรับผู้บริหาร
// -----------------------------------------------------------------------------
// ⚠️ ไฟล์นี้ประกอบข้อมูลอ่อนไหวสูง (ชื่อ + ข้อมูลสุขภาพ + พิกัดรายบ้าน) — ตัวเรียก
// ต้องบังคับ RBAC (ADMIN เท่านั้น) + เขียน Audit EXPORT ก่อนส่งไฟล์ออก
// การถอดรหัสชื่อทำที่ตัวเรียก (route) แล้วส่งค่าที่ถอดแล้วเข้ามา — helper ในไฟล์นี้จึง
// เป็น pure function ทดสอบได้โดยไม่ต้องมี key/DB
import ExcelJS from "exceljs";

export interface PersonVulnInput {
  nameTh: string;
  detail: string | null;
}

/** หนึ่งแถว = หนึ่งคนในกลุ่มเปราะบาง (ค่าถอดรหัสแล้ว) */
export interface VulnerableExportRow {
  /** ใช้เฉพาะหน้ารายชื่อในระบบ ไม่ถูกเขียนเป็นคอลัมน์ใน Excel */
  recordId?: string;
  triageCode?: "P1" | "P2" | "P3" | null;
  community: string;
  communityCode: string;
  seq: number;
  fullName: string;
  ageText: string;
  diseases: string;
  triage: string;
  coord: string;
  houseNo: string;
  mooNo: string;
  soi: string;
  road: string;
  tambon: string;
  sheetNo: string;
  status: string;
}

/** ประกอบชื่อจากคำนำหน้า + ชื่อ + นามสกุล — ว่างทั้งหมดคืนป้ายตามสถานะช่อง (F2/F3) */
export function assemblePersonName(
  prefix: string,
  firstName: string,
  lastName: string,
  nameStatus: string,
): string {
  const full = `${prefix}${firstName}${lastName ? ` ${lastName}` : ""}`.trim();
  if (full) return full;
  if (nameStatus === "BLANK_IN_PAPER") return "(เว้นว่างในกระดาษ)";
  if (nameStatus === "ILLEGIBLE") return "(อ่านไม่ออก)";
  return "(ไม่มีชื่อ)";
}

/** รวมลักษณะความเปราะบาง/โรค — แนบรายละเอียดในวงเล็บถ้ามี */
export function formatDiseases(vulns: PersonVulnInput[]): string {
  return vulns
    .map((v) => {
      if (!v.detail) return v.nameTh;
      // ป้องกัน ciphertext หลุดไปอยู่ในรายงาน แม้ผู้เรียกลืมถอดรหัส
      if (/^v\d+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]*:[A-Za-z0-9+/=]+$/.test(v.detail)) {
        return `${v.nameTh} (ไม่สามารถแสดงรายละเอียดได้)`;
      }
      return `${v.nameTh} (${v.detail})`;
    })
    .join("; ");
}

/** พิกัด: ใช้ lat/lng ถ้ามี ไม่งั้น fallback ข้อความดิบจากกระดาษ */
export function formatCoord(
  lat: string | null,
  lng: string | null,
  raw: string | null,
): string {
  if (lat && lng) return `${lat}, ${lng}`;
  return raw ?? "";
}

/** อายุ: ปี ถ้า > 0 ไม่งั้นเดือน (เด็กเล็ก) ไม่งั้นว่าง */
export function formatAge(age: number | null, ageMonths: number | null): string {
  if (age != null && age > 0) return `${age} ปี`;
  if (ageMonths != null) return `${ageMonths} เดือน`;
  return "";
}

const STATUS_TH: Record<string, string> = {
  VERIFIED: "ตรวจสอบแล้ว",
  ENTERED_1: "คีย์แล้ว (รอตรวจ)",
  ENTERED_2: "คีย์แล้ว (รอตรวจ)",
  PENDING: "รอคีย์",
  LOCKED: "กำลังคีย์",
  NEEDS_FIELD_QUERY: "รอถามกลับสนาม",
  DISCREPANCY: "รอตัดสินความต่าง",
  UNRESOLVABLE: "แก้ไม่ได้",
  SHEET_LOST: "กระดาษหาย",
  MERGED_INTO: "ถูกรวมเข้าใบอื่น",
};

export function statusLabel(status: string): string {
  return STATUS_TH[status] ?? status;
}

/** ชื่อชีต Excel: ตัดอักขระต้องห้าม \ / ? * [ ] : จำกัด 31 ตัว และกันชื่อซ้ำ */
export function safeSheetName(name: string, used: Set<string>): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "ชุมชน";
  let candidate = cleaned;
  let n = 1;
  while (used.has(candidate)) {
    n += 1;
    const suffix = `_${n}`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

const COLUMNS: Array<{ key: keyof VulnerableExportRow | "index"; header: string; width: number }> = [
  { key: "index", header: "ลำดับ", width: 8 },
  { key: "fullName", header: "ชื่อ - นามสกุล", width: 26 },
  { key: "ageText", header: "อายุ", width: 12 },
  { key: "diseases", header: "โรค / ลักษณะความเปราะบาง", width: 44 },
  { key: "triage", header: "ระดับเร่งด่วน", width: 12 },
  { key: "coord", header: "พิกัด (lat, lng)", width: 24 },
  { key: "houseNo", header: "บ้านเลขที่", width: 12 },
  { key: "mooNo", header: "หมู่", width: 9 },
  { key: "soi", header: "ซอย", width: 18 },
  { key: "road", header: "ถนน", width: 18 },
  { key: "tambon", header: "ตำบล", width: 18 },
  { key: "community", header: "ชุมชน", width: 22 },
  { key: "sheetNo", header: "รหัสแบบสอบถาม", width: 22 },
  { key: "status", header: "สถานะข้อมูล", width: 16 },
];

function fillSheet(ws: ExcelJS.Worksheet, title: string, rows: VulnerableExportRow[]): void {
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 4 }];
  const ncol = COLUMNS.length;

  ws.mergeCells(1, 1, 1, ncol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Tahoma", size: 14, bold: true, color: { argb: "FF0B1437" } };
  ws.getRow(1).height = 26;

  const subCell = ws.getCell(2, 1);
  subCell.value = `จำนวนกลุ่มเปราะบาง: ${rows.length} คน`;
  subCell.font = { name: "Tahoma", size: 10, color: { argb: "FF475569" } };

  const headerRow = ws.getRow(4);
  COLUMNS.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: "Tahoma", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });

  rows.forEach((row, idx) => {
    const r = ws.getRow(5 + idx);
    COLUMNS.forEach((col, i) => {
      const cell = r.getCell(i + 1);
      cell.value =
        col.key === "index"
          ? idx + 1
          : col.key === "status"
            ? statusLabel(row.status)
            : (row[col.key] as string) || "-";
      cell.font = { name: "Tahoma", size: 11 };
      const centered = ["index", "ageText", "triage", "status", "houseNo", "mooNo"].includes(col.key as string);
      cell.alignment = { vertical: "middle", horizontal: centered ? "center" : "left", wrapText: true };
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FF" } };
      }
    });
  });
}

/** สร้าง workbook: ชีต "ทั้งหมด" + หนึ่งชีตต่อชุมชน (เรียงตามชื่อ) → Buffer */
export async function buildVulnerableWorkbook(rows: VulnerableExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SKL-FRIS";
  wb.created = new Date();

  fillSheet(wb.addWorksheet("ทั้งหมด"), "รายชื่อกลุ่มเปราะบางทั้งหมด (ทุกชุมชน)", rows);

  const byCommunity = new Map<string, VulnerableExportRow[]>();
  for (const row of rows) {
    const list = byCommunity.get(row.community) ?? [];
    list.push(row);
    byCommunity.set(row.community, list);
  }

  const used = new Set<string>(["ทั้งหมด"]);
  for (const community of [...byCommunity.keys()].sort((a, b) => a.localeCompare(b, "th"))) {
    const ws = wb.addWorksheet(safeSheetName(community, used));
    fillSheet(ws, community, byCommunity.get(community)!);
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
