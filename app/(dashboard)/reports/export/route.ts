import { hasPermission } from "@/lib/authz/access";
import { getAuthorizationContext } from "@/lib/authz/context";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  buildExecutiveCsv,
  exportExecutiveReport,
  parseExecutiveReportFilters,
} from "@/lib/report/executive-summary";
import { dateRangeError } from "@/lib/household/trusted-where";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return new Response("ไม่ได้เข้าสู่ระบบ", { status: 401 });
  if (!hasPermission(ctx, PERMISSIONS.REPORT_VIEW)) return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });

  const params = new URL(request.url).searchParams;
  const filters = parseExecutiveReportFilters({
    community: params.get("community"),
    tambon: params.get("tambon"),
    from: params.get("from"),
    to: params.get("to"),
    status: params.get("status"),
  });
  const filterError = dateRangeError(filters.dateFrom, filters.dateTo);
  if (filterError) return new Response(`ช่วงวันที่ไม่ถูกต้อง: ${filterError}`, { status: 400 });
  const report = await exportExecutiveReport(ctx, filters);
  if (!report) return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });

  const csv = `\uFEFF${buildExecutiveCsv(report)}`;
  const filename = `executive-summary-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
