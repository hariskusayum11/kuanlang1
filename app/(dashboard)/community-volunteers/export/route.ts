import { getAuthorizationContext } from "@/lib/authz/context";
import { getKeyring } from "@/lib/crypto/keys";
import { buildVolunteerWorkbook, canViewCommunityVolunteers, listCommunityVolunteers } from "@/lib/community-volunteers/core";

export const dynamic = "force-dynamic";

// รายชื่ออาสาสมัครในชุมชน (docs/43) — สิทธิ์ volunteer.list.view · ขอบเขตชุมชน + Audit EXPORT อยู่ใน core
export async function GET(request: Request): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return new Response("ไม่ได้เข้าสู่ระบบ", { status: 401 });
  if (!canViewCommunityVolunteers(ctx)) return new Response("ไม่มีสิทธิ์ดูรายชื่ออาสาสมัคร", { status: 403 });

  const skill = new URL(request.url).searchParams.get("skill")?.trim() || undefined;
  const result = await listCommunityVolunteers(ctx, getKeyring(), { skill, purpose: "export" });
  if (!result) return new Response("ไม่มีสิทธิ์ดูรายชื่ออาสาสมัคร", { status: 403 });
  const buffer = await buildVolunteerWorkbook(result.rows);
  const filename = `volunteers-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
