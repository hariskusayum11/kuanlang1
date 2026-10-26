import { AuditAction } from "@prisma/client";
import { getAuthorizationContext } from "@/lib/authz/context";
import { getKeyring } from "@/lib/crypto/keys";
import { writeAuditLog } from "@/lib/audit/log";
import { canViewRedGroup, listRedGroupPeople } from "@/lib/red-group/core";
import { buildRedGroupWorkbook, toExportRows } from "@/lib/red-group/export";

export const dynamic = "force-dynamic";

// รายชื่อกลุ่มเปราะบางสีแดง (docs/42) — ชื่อ เบอร์ พิกัดรายบ้าน
// สิทธิ์ RED_GROUP_VIEW · หัวหน้าชุมชนได้เฉพาะชุมชนที่ผูกไว้ (กรองใน listRedGroupPeople)
// Audit EXPORT ทุกครั้ง (ไม่มี PII ใน log — จำนวนเท่านั้น)
export async function GET(): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return new Response("ไม่ได้เข้าสู่ระบบ", { status: 401 });
  if (!canViewRedGroup(ctx)) {
    return new Response("ไม่มีสิทธิ์ดาวน์โหลดรายชื่อกลุ่มสีแดง", { status: 403 });
  }

  const generatedAt = new Date();
  const result = await listRedGroupPeople(ctx, generatedAt);
  const rows = toExportRows(result.rows, getKeyring());
  const buffer = await buildRedGroupWorkbook(result, rows, generatedAt);

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.EXPORT,
    entityType: "RedGroupList",
    changes: {
      format: "xlsx",
      personCount: result.tally.people,
      householdCount: result.tally.households,
      communityIds: result.communities.map((c) => c.id),
      scope: ctx.isGlobalScope ? "all" : "assigned",
    },
    reason: "ดาวน์โหลดรายชื่อกลุ่มเปราะบางสีแดง (เคลื่อนย้ายเมื่อได้รับสัญญาณ)",
  });

  const filename = `red-group-${generatedAt.toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
