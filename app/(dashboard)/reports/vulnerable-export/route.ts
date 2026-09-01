import { getAuthorizationContext } from "@/lib/authz/context";
import { hasPermission } from "@/lib/authz/access";
import { PERMISSIONS } from "@/lib/authz/permissions";
import { prisma } from "@/lib/prisma";
import { decryptText } from "@/lib/crypto/encryption";
import { getKeyring } from "@/lib/crypto/keys";
import { writeAuditLog } from "@/lib/audit/log";
import {
  assemblePersonName,
  buildVulnerableWorkbook,
  formatAge,
  formatCoord,
  formatDiseases,
  type VulnerableExportRow,
} from "@/lib/report/vulnerable-export";
import { effectiveTriage, triageLabel, type TriageCode } from "@/domain/triage";
import { DuplicateResolutionEnum, SheetStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

// ข้อมูลอ่อนไหวสูง (ชื่อ + สุขภาพ + พิกัดรายบ้าน) ต้องผ่าน permission เฉพาะ
// และบันทึก Audit Log ทุกครั้งที่ส่งออก
export async function GET(request: Request): Promise<Response> {
  const ctx = await getAuthorizationContext();
  if (!ctx) return new Response("ไม่ได้เข้าสู่ระบบ", { status: 401 });
  if (!hasPermission(ctx, PERMISSIONS.MEDICAL_REPORT_EXPORT)) {
    return new Response("ไม่มีสิทธิ์ส่งออกข้อมูลสุขภาพ", { status: 403 });
  }

  const keyring = getKeyring();
  const safeDecrypt = (v: string | null): string => {
    if (!v) return "";
    try {
      return decryptText(v, keyring);
    } catch {
      return "(ถอดรหัสไม่ได้)";
    }
  };

  const households = await prisma.household.findMany({
    where: {
      deletedAt: null,
      sheet: { status: SheetStatus.VERIFIED },
      OR: [
        { duplicateResolution: null },
        { duplicateResolution: DuplicateResolutionEnum.NOT_DUPLICATE },
      ],
      vulnerablePersons: { some: { isActive: true } },
    },
    select: {
      houseNo: true,
      mooNo: true,
      soi: true,
      road: true,
      latitude: true,
      longitude: true,
      coordinateRawText: true,
      community: { select: { nameTh: true, code: true } },
      tambon: { select: { nameTh: true } },
      sheet: { select: { sheetNo: true, status: true } },
      vulnerablePersons: {
        where: { isActive: true },
        orderBy: { seq: "asc" },
        select: {
          seq: true,
          firstName: true,
          lastName: true,
          nameStatus: true,
          age: true,
          ageMonths: true,
          triageLevel: true,
          prefixOther: true,
          namePrefix: { select: { nameTh: true } },
          vulnerabilities: {
            select: {
              detail: true,
              vulnerabilityType: { select: { nameTh: true, basePriority: true } },
            },
          },
        },
      },
    },
  });

  const rows: VulnerableExportRow[] = [];
  for (const h of households) {
    const coord = formatCoord(
      h.latitude?.toString() ?? null,
      h.longitude?.toString() ?? null,
      h.coordinateRawText,
    );
    for (const p of h.vulnerablePersons) {
      rows.push({
        community: h.community?.nameTh ?? "(ไม่ระบุชุมชน)",
        communityCode: h.community?.code ?? "",
        seq: p.seq,
        fullName: assemblePersonName(
          p.namePrefix?.nameTh ?? p.prefixOther ?? "",
          safeDecrypt(p.firstName),
          safeDecrypt(p.lastName),
          p.nameStatus,
        ),
        ageText: formatAge(p.age, p.ageMonths),
        diseases: formatDiseases(
          p.vulnerabilities.map((v) => ({
            nameTh: v.vulnerabilityType.nameTh,
            detail: safeDecrypt(v.detail),
          })),
        ),
        triage: triageLabel(effectiveTriage(
          p.triageLevel as TriageCode | null,
          p.vulnerabilities.map((item) => item.vulnerabilityType.basePriority as TriageCode),
        )),
        coord,
        houseNo: h.houseNo ?? "",
        mooNo: h.mooNo != null && h.mooNo > 0 ? String(h.mooNo) : "",
        soi: h.soi ?? "",
        road: h.road ?? "",
        tambon: h.tambon?.nameTh ?? "",
        sheetNo: h.sheet?.sheetNo ?? "",
        status: h.sheet?.status ?? "",
      });
    }
  }

  const buffer = await buildVulnerableWorkbook(rows);

  // Audit EXPORT — ไม่บันทึก PII ดิบ เก็บแค่จำนวนแถว/ชุมชน (มาตรการชดเชยตาม CLAUDE.md)
  await writeAuditLog({
    userId: ctx.userId,
    action: "EXPORT",
    entityType: "VulnerablePerson",
    changes: {
      format: "xlsx",
      personCount: rows.length,
      communityCount: new Set(rows.map((r) => r.community)).size,
    },
    reason: "ดาวน์โหลดรายชื่อกลุ่มเปราะบางแยกชุมชน (ผู้บริหาร)",
  });

  const filename = `vulnerable-persons-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new Response(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
