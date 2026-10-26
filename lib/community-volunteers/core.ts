// รายชื่ออาสาสมัครในชุมชน (docs/43) — คนที่ติ๊ก "สนใจเป็นอาสาสมัคร" ในแบบสอบถาม
// -----------------------------------------------------------------------------
// ชื่อ/เบอร์ = ผู้ให้ข้อมูลของบ้านนั้น (แบบสอบถามถามความสนใจระดับบ้าน ไม่ได้แยกรายคน)
// ใบที่ตรวจแล้วเท่านั้น · หัวหน้าชุมชนเห็นเฉพาะชุมชนที่ผูกไว้ · Audit READ/EXPORT ทุกครั้ง (ไม่มี PII ใน log)
import ExcelJS from "exceljs";
import { AuditAction } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission, scopedCommunityIds } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { decryptText, type Keyring } from "../crypto/encryption";
import { buildUsableHouseholdWhere } from "../household/trusted-where";

export interface CommunityVolunteerRow {
  householdId: string;
  sheetNo: string;
  communityName: string;
  name: string;
  phone: string;
  address: string;
  skills: { code: string; label: string }[];
}

export interface CommunityVolunteerResult {
  rows: CommunityVolunteerRow[];
  skills: { code: string; label: string; count: number }[];
}

export function canViewCommunityVolunteers(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.VOLUNTEER_LIST_VIEW);
}

function addressOf(h: { houseNo: string | null; mooNo: number | null; soi: string | null; road: string | null }): string {
  return [
    h.houseNo ? `บ้านเลขที่ ${h.houseNo}` : "",
    h.mooNo && h.mooNo > 0 ? `หมู่ ${h.mooNo}` : "",
    h.soi ? `ซ.${h.soi}` : "",
    h.road ? `ถ.${h.road}` : "",
  ].filter(Boolean).join(" ");
}

/** null = ไม่มีสิทธิ์ · skill = รหัสทักษะ (ไม่ระบุ = ทุกทักษะ) */
export async function listCommunityVolunteers(
  ctx: AuthorizationContext,
  keyring: Keyring,
  options: { skill?: string; purpose?: "view" | "export" } = {},
): Promise<CommunityVolunteerResult | null> {
  if (!canViewCommunityVolunteers(ctx)) return null;
  const decrypt = (value: string | null): string => {
    if (!value) return "";
    try {
      return decryptText(value, keyring);
    } catch {
      return "(ถอดรหัสไม่ได้)";
    }
  };

  const households = await prisma.household.findMany({
    where: {
      AND: [
        buildUsableHouseholdWhere({ status: "VERIFIED" }, scopedCommunityIds(ctx)),
        { volunteerNotAvailable: { not: true } },
        { volunteerInterests: { some: { isAvailable: true } } },
      ],
    },
    orderBy: [{ community: { code: "asc" } }, { houseNo: "asc" }],
    select: {
      id: true,
      houseNo: true,
      mooNo: true,
      soi: true,
      road: true,
      respondentFirstName: true,
      respondentLastName: true,
      respondentPhone: true,
      respondentPrefixOther: true,
      respondentPrefix: { select: { nameTh: true } },
      community: { select: { nameTh: true } },
      sheet: { select: { sheetNo: true } },
      volunteerInterests: {
        where: { isAvailable: true },
        orderBy: { volunteerType: { sortOrder: "asc" } },
        select: { volunteerType: { select: { code: true, nameTh: true } } },
      },
    },
  });

  const all: CommunityVolunteerRow[] = households.map((h) => {
    const prefix = h.respondentPrefix?.nameTh === "อื่นๆ" ? (h.respondentPrefixOther ?? "") : (h.respondentPrefix?.nameTh ?? h.respondentPrefixOther ?? "");
    const fullName = `${prefix}${decrypt(h.respondentFirstName)} ${decrypt(h.respondentLastName)}`.trim();
    return {
      householdId: h.id,
      sheetNo: h.sheet.sheetNo,
      communityName: h.community.nameTh,
      name: fullName || "(ไม่มีชื่อผู้ให้ข้อมูล)",
      phone: decrypt(h.respondentPhone),
      address: addressOf(h),
      skills: h.volunteerInterests.map((v) => ({ code: v.volunteerType.code, label: v.volunteerType.nameTh })),
    };
  });

  const skillCounts = new Map<string, { code: string; label: string; count: number }>();
  for (const row of all) {
    for (const s of row.skills) {
      const entry = skillCounts.get(s.code) ?? { ...s, count: 0 };
      entry.count += 1;
      skillCounts.set(s.code, entry);
    }
  }
  const rows = options.skill ? all.filter((row) => row.skills.some((s) => s.code === options.skill)) : all;

  await writeAuditLog({
    userId: ctx.userId,
    action: options.purpose === "export" ? AuditAction.EXPORT : AuditAction.READ,
    entityType: "CommunityVolunteerList",
    reason: options.purpose === "export" ? "community-volunteers-xlsx" : "community-volunteers-view",
    changes: { count: rows.length, skill: options.skill ?? null, scope: ctx.isGlobalScope ? "all" : "assigned" },
  });

  return { rows, skills: [...skillCounts.values()] };
}

/** ไฟล์ Excel ชีตเดียว — ชื่อ เบอร์ ทักษะ ที่อยู่ ชุมชน */
export async function buildVolunteerWorkbook(rows: CommunityVolunteerRow[], generatedAt: Date = new Date()): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SKL-FRIS";
  wb.created = generatedAt;
  const ws = wb.addWorksheet("อาสาสมัคร");
  ws.views = [{ state: "frozen", ySplit: 3 }];
  ws.getCell(1, 1).value = `อาสาสมัครในชุมชน — ${rows.length.toLocaleString("th-TH")} คน (ข้อมูลจากแบบสอบถามที่ตรวจแล้ว)`;
  ws.getCell(1, 1).font = { name: "Tahoma", size: 13, bold: true };
  ws.getCell(2, 1).value = "⚠️ มีข้อมูลส่วนบุคคล ใช้เพื่อประสานงานช่วยเหลือเท่านั้น ห้ามส่งต่อในกลุ่มสาธารณะ";
  ws.getCell(2, 1).font = { name: "Tahoma", size: 10, color: { argb: "FFB91C1C" } };
  const columns = [
    { header: "ลำดับ", width: 7 },
    { header: "ชื่อ - นามสกุล", width: 26 },
    { header: "เบอร์โทร", width: 16 },
    { header: "ทักษะที่สนใจ", width: 40 },
    { header: "ที่อยู่", width: 32 },
    { header: "ชุมชน", width: 20 },
    { header: "รหัสแบบสอบถาม", width: 14 },
  ];
  const header = ws.getRow(3);
  columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width;
    const cell = header.getCell(i + 1);
    cell.value = col.header;
    cell.font = { name: "Tahoma", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  });
  rows.forEach((row, idx) => {
    const r = ws.getRow(4 + idx);
    [idx + 1, row.name, row.phone || "-", row.skills.map((s) => s.label).join(" · "), row.address || "-", row.communityName, row.sheetNo]
      .forEach((value, i) => {
        const cell = r.getCell(i + 1);
        cell.value = value;
        cell.font = { name: "Tahoma", size: 11 };
        cell.alignment = { vertical: "top", wrapText: true };
      });
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
