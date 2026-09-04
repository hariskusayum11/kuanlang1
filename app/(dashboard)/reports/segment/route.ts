// Drill-down JSON — รายชื่อของ segment สำหรับแสดงใน modal (ข้อ 3/7)
// -----------------------------------------------------------------------------
// RBAC ตาม permissionForSegment (health → MEDICAL_REPORT_EXPORT, general → REPORT_SEGMENT_EXPORT)
// Audit READ ทุกครั้งที่เปิดดู (ข้อมูลส่วนบุคคล) · เคารพตัวกรอง + ขอบเขตเดิมผ่าน base where

import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { getKeyring } from "@/lib/crypto/keys";
import { writeAuditLog } from "@/lib/audit/log";
import { parseExecutiveReportFilters } from "@/lib/report/executive-summary";
import { resolveSegment, permissionForSegment } from "@/lib/report/segments";
import { resolveSegmentLabel } from "@/lib/report/segment-label";
import { fetchSegmentRows } from "@/lib/report/segment-data";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PREVIEW_LIMIT = 1000;

function quickEditKind(segmentId: string): "triage" | "host-house" | "volunteer" | null {
  if (segmentId.startsWith("triage:")) return "triage";
  if (segmentId === "host-houses") return "host-house";
  if (segmentId === "volunteers" || segmentId.startsWith("skill:")) return "volunteer";
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return Response.json({ error: "ไม่ได้เข้าสู่ระบบ" }, { status: 401 });

  const url = new URL(request.url);
  const seg = resolveSegment(url.searchParams.get("segment") ?? "");
  if (!seg) return Response.json({ error: "ไม่รู้จักกลุ่มข้อมูล" }, { status: 400 });
  if (!hasPermission(ctx, permissionForSegment(seg))) {
    return Response.json({ error: "ไม่มีสิทธิ์ดูรายชื่อกลุ่มนี้" }, { status: 403 });
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
  const total = result.rows.length;
  const editKind = hasPermission(ctx, PERMISSIONS.REPORT_QUICK_EDIT) ? quickEditKind(seg.id) : null;
  const volunteerSkills = editKind === "volunteer"
    ? await prisma.volunteerSkillType.findMany({
        where: { isActive: true },
        select: { id: true, nameTh: true },
        orderBy: [{ sortOrder: "asc" }, { nameTh: "asc" }],
      })
    : [];

  await writeAuditLog({
    userId: ctx.userId,
    action: "READ",
    entityType: seg.kind === "person" ? "VulnerablePerson" : "Household",
    reason: `segment-drilldown:${seg.id}`,
    changes: {
      segment: seg.id,
      total,
      community: filters.communityId ?? null,
      tambon: filters.tambonId ?? null,
      status: filters.status,
    },
  });

  return Response.json({
    kind: result.kind,
    label,
    total,
    truncated: total > PREVIEW_LIMIT,
    rows: result.rows.slice(0, PREVIEW_LIMIT),
    quickEdit: editKind
      ? {
          kind: editKind,
          volunteerSkills: volunteerSkills.map((item) => ({ id: item.id, label: item.nameTh })),
        }
      : null,
  });
}
