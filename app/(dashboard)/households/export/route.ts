// CSV Export — ครัวเรือนที่ตรวจแล้ว (VERIFIED)
// -----------------------------------------------------------------------------
// RBAC ตรวจฝั่ง server (household.view) · Audit EXPORT เขียนใน exportVerifiedHouseholds
// Privacy: CSV มีเฉพาะฟิลด์โครงสร้าง ไม่มี ชื่อ/เบอร์/พิกัด (ดู lib/household/list.ts)
// เติม BOM ให้ Excel เปิดภาษาไทยไม่เพี้ยน

import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  buildHouseholdsCsv,
  exportVerifiedHouseholds,
  type HouseholdListFilters,
} from "@/lib/household/list";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return new Response("ไม่ได้เข้าสู่ระบบ", { status: 401 });
  if (!hasPermission(ctx, PERMISSIONS.HOUSEHOLD_VIEW)) {
    return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });
  }

  const url = new URL(request.url);
  const filters: HouseholdListFilters = {
    communityId: url.searchParams.get("community") || undefined,
    tambonId: url.searchParams.get("tambon") || undefined,
    search: url.searchParams.get("q") || undefined,
  };

  const rows = await exportVerifiedHouseholds(ctx, filters);
  if (rows === null) return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });

  const csv = `\uFEFF${buildHouseholdsCsv(rows)}`;
  const filename = `verified-households-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
