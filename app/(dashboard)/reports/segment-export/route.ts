// Drill-down Excel — ส่งออกรายชื่อของ segment เฉพาะกลุ่ม (ข้อ 3/7)
// -----------------------------------------------------------------------------
// RBAC ตาม permissionForSegment · Audit EXPORT ทุกครั้ง · เคารพตัวกรอง + ขอบเขตเดิม
// person → workbook แยกชุมชน (buildVulnerableWorkbook) · household → ชีตเดียว + คอลัมน์ "อื่นๆ"

import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { getKeyring } from "@/lib/crypto/keys";
import { writeAuditLog } from "@/lib/audit/log";
import { parseExecutiveReportFilters } from "@/lib/report/executive-summary";
import { resolveSegment, permissionForSegment } from "@/lib/report/segments";
import { resolveSegmentLabel } from "@/lib/report/segment-label";
import { fetchSegmentRows } from "@/lib/report/segment-data";
import { buildHouseholdSegmentWorkbook } from "@/lib/report/segment-workbook";
import { buildVulnerableWorkbook } from "@/lib/report/vulnerable-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return new Response("ไม่ได้เข้าสู่ระบบ", { status: 401 });

  const url = new URL(request.url);
  const seg = resolveSegment(url.searchParams.get("segment") ?? "");
  if (!seg) return new Response("ไม่รู้จักกลุ่มข้อมูล", { status: 400 });
  if (!hasPermission(ctx, permissionForSegment(seg))) {
    return new Response("ไม่มีสิทธิ์ส่งออกข้อมูลกลุ่มนี้", { status: 403 });
  }

  const filters = parseExecutiveReportFilters({
    community: url.searchParams.get("community"),
    tambon: url.searchParams.get("tambon"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    status: url.searchParams.get("status"),
  });

  const [result, label] = await Promise.all([
    fetchSegmentRows(ctx, filters, seg, getKeyring()),
    resolveSegmentLabel(seg),
  ]);

  const buffer =
    result.kind === "person"
      ? await buildVulnerableWorkbook(result.rows)
      : await buildHouseholdSegmentWorkbook(label, result.rows, Boolean(seg.detail));

  await writeAuditLog({
    userId: ctx.userId,
    action: "EXPORT",
    entityType: seg.kind === "person" ? "VulnerablePerson" : "Household",
    reason: `segment-export:${seg.id}`,
    changes: {
      segment: seg.id,
      format: "xlsx",
      rowCount: result.rows.length,
      community: filters.communityId ?? null,
      tambon: filters.tambonId ?? null,
      status: filters.status,
    },
  });

  const slug = seg.id.replace(/[^A-Za-z0-9]+/g, "-");
  const filename = `segment-${slug}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
