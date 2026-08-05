// CSV Export — สรุปการกรอกรายคน (สำหรับคิดค่ากรอก)
// -----------------------------------------------------------------------------
// RBAC ฝั่ง server (report.view) · Audit EXPORT เขียนใน exportKeyerProductivity
// เติม BOM ให้ Excel เปิดภาษาไทยไม่เพี้ยน

import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import {
  buildKeyerCsv,
  exportKeyerProductivity,
} from "@/lib/report/keyer-productivity";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return new Response("ไม่ได้เข้าสู่ระบบ", { status: 401 });
  if (!hasPermission(ctx, PERMISSIONS.REPORT_VIEW)) {
    return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });
  }

  const rows = await exportKeyerProductivity(ctx);
  if (rows === null) return new Response("ไม่มีสิทธิ์เข้าถึง", { status: 403 });

  const csv = `\uFEFF${buildKeyerCsv(rows)}`;
  const filename = `keyer-productivity-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
