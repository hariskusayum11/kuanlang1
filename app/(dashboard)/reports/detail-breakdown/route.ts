// สรุป "อื่นๆ" รายข้อความ + จำนวน (ข้อ 6) — ใช้กับ popup บนแดชบอร์ด/รายงาน
// -----------------------------------------------------------------------------
// aggregate สุขภาพ → ต้องมี MEDICAL_DASHBOARD_VIEW (ADMIN/ผู้บริหาร) · Audit READ ทุกครั้ง
// ?format=xlsx → ดาวน์โหลดเป็น Excel (2 คอลัมน์: รายละเอียด | จำนวน) · Audit EXPORT

import ExcelJS from "exceljs";
import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { getKeyring } from "@/lib/crypto/keys";
import { writeAuditLog } from "@/lib/audit/log";
import { prisma } from "@/lib/prisma";
import { parseExecutiveReportFilters } from "@/lib/report/executive-summary";
import { fetchVulnerabilityDetailBreakdown, type DetailBreakdown } from "@/lib/report/detail-breakdown";

export const dynamic = "force-dynamic";

async function buildWorkbook(title: string, data: DetailBreakdown): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SKL-FRIS";
  wb.created = new Date();
  const ws = wb.addWorksheet("รายละเอียด");
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: 3 }];
  ws.mergeCells(1, 1, 1, 2);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: "Tahoma", size: 14, bold: true, color: { argb: "FF0B1437" } };
  ws.getCell(2, 1).value = `ระบุรายละเอียด ${data.withDetail} คน · ไม่ได้ระบุ ${data.withoutDetail} คน · รวม ${data.totalPeople} คน`;
  ws.getCell(2, 1).font = { name: "Tahoma", size: 10, color: { argb: "FF475569" } };
  ws.getColumn(1).width = 52;
  ws.getColumn(2).width = 12;
  const header = ws.getRow(3);
  ["รายละเอียด (อื่นๆ)", "จำนวน (คน)"].forEach((h, i) => {
    const cell = header.getCell(i + 1);
    cell.value = h;
    cell.font = { name: "Tahoma", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  data.items.forEach((item, idx) => {
    const r = ws.getRow(4 + idx);
    r.getCell(1).value = item.text;
    r.getCell(2).value = item.count;
    r.getCell(2).alignment = { horizontal: "center" };
    if (idx % 2 === 1) {
      for (const c of [1, 2]) r.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F7FF" } };
    }
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function GET(request: Request): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return new Response("ไม่ได้เข้าสู่ระบบ", { status: 401 });
  if (!hasPermission(ctx, PERMISSIONS.MEDICAL_DASHBOARD_VIEW)) {
    return new Response("ไม่มีสิทธิ์ดูรายละเอียดข้อมูลสุขภาพ", { status: 403 });
  }

  const url = new URL(request.url);
  const typeId = url.searchParams.get("type") ?? "";
  if (!typeId) return new Response("ต้องระบุประเภท", { status: 400 });

  const type = await prisma.vulnerabilityType.findUnique({
    where: { id: typeId },
    select: { nameTh: true },
  });
  if (!type) return new Response("ไม่รู้จักประเภท", { status: 404 });

  const filters = parseExecutiveReportFilters({
    community: url.searchParams.get("community"),
    tambon: url.searchParams.get("tambon"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    status: url.searchParams.get("status"),
  });
  const data = await fetchVulnerabilityDetailBreakdown(ctx, filters, typeId, getKeyring());
  const wantsXlsx = url.searchParams.get("format") === "xlsx";

  await writeAuditLog({
    userId: ctx.userId,
    action: wantsXlsx ? "EXPORT" : "READ",
    entityType: "PersonVulnerability",
    reason: `vulnerability-detail:${typeId}`,
    changes: {
      vulnerabilityTypeId: typeId,
      distinct: data.items.length,
      withDetail: data.withDetail,
      community: filters.communityId ?? null,
      status: filters.status,
    },
  });

  if (wantsXlsx) {
    const buffer = await buildWorkbook(`รายละเอียด: ${type.nameTh}`, data);
    const filename = `vulnerability-detail-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new Response(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return Response.json({ label: type.nameTh, ...data });
}
