import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  buildKeyerCsv,
  exportKeyerProductivity,
} from "@/lib/report/keyer-productivity";
import { dateRangeError } from "@/lib/household/trusted-where";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return new Response("ไม่ได้เข้าสู่ระบบ", { status: 401 });
  if (!hasPermission(ctx, PERMISSIONS.KEYER_PERFORMANCE_VIEW)) {
    return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const filters = {
    dateFrom: params.get("from") || undefined,
    dateTo: params.get("to") || undefined,
  };
  const filterError = dateRangeError(filters.dateFrom, filters.dateTo);
  if (filterError) return new Response(`ช่วงวันที่ไม่ถูกต้อง: ${filterError}`, { status: 400 });

  const rows = await exportKeyerProductivity(ctx, filters);
  if (rows === null) return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });

  const csv = `\uFEFF${buildKeyerCsv(rows)}`;
  const filename = `keyer-productivity-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
