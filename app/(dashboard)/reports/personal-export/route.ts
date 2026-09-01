import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { dateRangeError } from "@/lib/household/trusted-where";
import { exportPersonalReport } from "@/lib/report/personal-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return new Response("ไม่ได้เข้าสู่ระบบ", { status: 401 });
  if (!hasPermission(ctx, PERMISSIONS.PERSONAL_REPORT_EXPORT)) {
    return new Response("ไม่มีสิทธิ์ส่งออกรายงานรายบุคคล", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const filters = {
    communityId: params.get("community") || undefined,
    tambonId: params.get("tambon") || undefined,
    dateFrom: params.get("from") || undefined,
    dateTo: params.get("to") || undefined,
  };
  const filterError = dateRangeError(filters.dateFrom, filters.dateTo);
  if (filterError) return new Response(`ช่วงวันที่ไม่ถูกต้อง: ${filterError}`, { status: 400 });

  const report = await exportPersonalReport(ctx, filters);
  if (!report) return new Response("ไม่มีสิทธิ์ส่งออกรายงานรายบุคคล", { status: 403 });

  const filename = `personal-questionnaire-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(report.buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
