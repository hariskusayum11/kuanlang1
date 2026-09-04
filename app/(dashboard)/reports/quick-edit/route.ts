import { getAuthorizationContext } from "@/lib/authz/context";
import { applyReportQuickEdit, parseReportQuickEditInput } from "@/lib/report/quick-edit";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return Response.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const input = parseReportQuickEditInput(await request.json().catch(() => null));
  if (!input) return Response.json({ error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }, { status: 400 });

  const result = await applyReportQuickEdit(ctx, input);
  if (result.ok) return Response.json({ ok: true });
  if (result.reason === "FORBIDDEN") return Response.json({ error: "เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขได้" }, { status: 403 });
  if (result.reason === "NOT_FOUND") return Response.json({ error: "ไม่พบรายการ หรือรายการถูกลบแล้ว" }, { status: 404 });
  return Response.json({ error: "ค่าที่เลือกไม่ถูกต้อง" }, { status: 400 });
}
