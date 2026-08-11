import { AuditAction } from "@prisma/client";
import { fetchQuestionnaireAnalytics, type QuestionnaireAnalytics } from "../dashboard/questionnaire-analytics";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import type { HouseholdAnalyticsFilters, SurveyStatusFilter } from "../household/trusted-where";

export type ExecutiveReport = QuestionnaireAnalytics;

export function parseExecutiveReportFilters(input: {
  community?: string | null;
  tambon?: string | null;
  from?: string | null;
  to?: string | null;
  status?: string | null;
}): HouseholdAnalyticsFilters {
  const status: SurveyStatusFilter = input.status === "PENDING" || input.status === "ALL" ? input.status : "VERIFIED";
  return {
    communityId: input.community || undefined,
    tambonId: input.tambon || undefined,
    dateFrom: input.from || undefined,
    dateTo: input.to || undefined,
    status,
  };
}

async function loadReport(ctx: AuthorizationContext, filters: HouseholdAnalyticsFilters, action: AuditAction) {
  if (!hasPermission(ctx, PERMISSIONS.REPORT_VIEW)) return null;
  const report = await fetchQuestionnaireAnalytics(
    { isGlobalScope: ctx.isGlobalScope, communityIds: ctx.communityIds },
    filters,
  );
  await writeAuditLog({
    userId: ctx.userId,
    action,
    entityType: "ExecutiveSummaryReport",
    reason: action === AuditAction.EXPORT ? "executive-summary-csv" : "executive-summary-view",
    changes: {
      communityId: filters.communityId ?? null,
      tambonId: filters.tambonId ?? null,
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
      status: filters.status ?? "VERIFIED",
      households: report.summary.households,
    },
  });
  return report;
}

export function getExecutiveReport(ctx: AuthorizationContext, filters: HouseholdAnalyticsFilters) {
  return loadReport(ctx, filters, AuditAction.READ);
}

export function exportExecutiveReport(ctx: AuthorizationContext, filters: HouseholdAnalyticsFilters) {
  return loadReport(ctx, filters, AuditAction.EXPORT);
}

type CsvRow = [section: string, item: string, value: string | number, unit: string];

export function executiveReportRows(report: ExecutiveReport): CsvRow[] {
  const rows: CsvRow[] = [
    ["ภาพรวม", "จำนวนครัวเรือน", report.summary.households, "ครัวเรือน"],
    ["ภาพรวม", "ประชากรรวม", report.summary.people, "คน"],
    ["กลุ่มเปราะบาง", "ครัวเรือนที่มีกลุ่มเปราะบาง", report.summary.vulnerableHouseholds, "ครัวเรือน"],
    ["กลุ่มเปราะบาง", "บุคคลกลุ่มเปราะบาง", report.summary.vulnerablePeople, "คน"],
    ["กลุ่มเปราะบาง", "P1 วิกฤต", report.triage.P1, "คน"],
    ["กลุ่มเปราะบาง", "P2 เร่งด่วน", report.triage.P2, "คน"],
    ["กลุ่มเปราะบาง", "P3 เฝ้าระวัง", report.triage.P3, "คน"],
    ["กลุ่มเปราะบาง", "ยังไม่ประเมิน", report.triage.UNASSESSED, "คน"],
    ["ความช่วยเหลือ", "จำนวนผู้ต้องการความช่วยเหลือรวม", report.summary.assistancePeople, "คน"],
    ...report.assistance.flatMap<CsvRow>((item) => [
      ["ความช่วยเหลือ", `${item.label} — จำนวนครัวเรือน`, item.count, "ครัวเรือน"],
      ["ความช่วยเหลือ", `${item.label} — จำนวนคน`, item.people ?? 0, "คน"],
    ]),
    ["น้ำท่วม", "ครัวเรือนที่เคยน้ำท่วม", report.flood.floodedHouseholds, "ครัวเรือน"],
    ["น้ำท่วม", "ระดับน้ำเฉลี่ย", Math.round(report.flood.averageDepthCm ?? 0), "ซม."],
    ["น้ำท่วม", "ระดับน้ำสูงสุด", report.flood.maximumDepthCm ?? 0, "ซม."],
    ["น้ำท่วม", "ระยะเวลาน้ำท่วมเฉลี่ย", Math.round(report.flood.averageDurationDays ?? 0), "วัน"],
    ["ความพร้อม", "ไม่มีชุดยังชีพ", report.flood.withoutSurvivalKit, "ครัวเรือน"],
    ["ความพร้อม", "ไม่มีทรัพยากร", report.flood.withoutResources, "ครัวเรือน"],
    ...report.preparedness.vehicles.map<CsvRow>((item) => ["ยานพาหนะอพยพ", item.label, item.count, "รายการ"]),
    ...report.preparedness.alertChannels.map<CsvRow>((item) => ["ช่องทางข่าวสาร", item.label, item.count, "ครัวเรือน"]),
    ["ดิจิทัล", "ใช้สมาร์ตโฟน", report.preparedness.smartphoneHouseholds, "ครัวเรือน"],
    ["ดิจิทัล", "สแกน QR ได้", report.preparedness.qrReadyHouseholds, "ครัวเรือน"],
    ["การมีส่วนร่วม", "ผู้สนใจเป็นอาสาสมัคร", report.participation.volunteerHouseholds, "ครัวเรือน"],
    ...report.participation.volunteerSkills.map<CsvRow>((item) => ["ทักษะอาสาสมัคร", item.label, item.count, "ครัวเรือน"]),
    ["การมีส่วนร่วม", "ยินยอมเป็นจุดพักพิงเบื้องต้น", report.participation.potentialHostHouses, "ครัวเรือน"],
    ["การช่วยเหลือ", "ต้องการดูแลสุขภาพจิต", report.participation.mentalHealthSupport, "ครัวเรือน"],
    ["การช่วยเหลือ", "สนใจโครงการแก้ไขความยากจน", report.participation.povertyProgramInterest, "ครัวเรือน"],
    ["คุณภาพข้อมูล", "ไม่มีพิกัด", report.quality.missingCoordinates, "ใบ"],
    ["คุณภาพข้อมูล", "ข้อมูลไม่ครบ", report.quality.incomplete, "ใบ"],
    ["คุณภาพข้อมูล", "มีช่องอ่านไม่ออก", report.quality.illegible, "ใบ"],
  ];
  return rows;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildExecutiveCsv(report: ExecutiveReport): string {
  const lines = [["หมวด", "รายการ", "จำนวน", "หน่วย"].join(",")];
  for (const row of executiveReportRows(report)) lines.push(row.map(csvCell).join(","));
  return lines.join("\r\n");
}
