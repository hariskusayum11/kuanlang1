import {
  AuditAction,
  DuplicateResolutionEnum,
  SheetStatus,
} from "@prisma/client";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { writeAuditLog } from "../audit/log";
import { decryptText } from "../crypto/encryption";
import { getKeyring } from "../crypto/keys";
import { normalizePage, normalizePageSize } from "../pagination";
import { prisma } from "../prisma";
import { effectiveTriage, triageLabel, type TriageCode } from "@/domain/triage";
import {
  assemblePersonName,
  formatAge,
  formatDiseases,
} from "../report/vulnerable-export";

export type MedicalTriageFilter = TriageCode | "UNASSESSED";

export interface MedicalCaseFilters {
  search?: string;
  communityId?: string;
  tambonId?: string;
  triage?: MedicalTriageFilter;
  vulnerabilityTypeId?: string;
}

export interface MedicalCaseRow {
  personId: string;
  sheetNo: string;
  fullName: string;
  ageText: string;
  phone: string;
  triage: TriageCode | null;
  triageLabel: string;
  vulnerabilities: string;
  assistance: string;
  mentalHealthSupport: boolean | null;
  address: string;
  community: string;
  tambon: string;
  surveyedAt: Date | null;
  mapsUrl: string | null;
}

export interface MedicalCaseListResult {
  rows: MedicalCaseRow[];
  total: number;
  page: number;
  pageSize: number;
  truncated: boolean;
  summary: {
    total: number;
    critical: number;
    urgent: number;
    watch: number;
    unassessed: number;
    mentalHealth: number;
  };
  options: {
    communities: Array<{ id: string; nameTh: string }>;
    tambons: Array<{ id: string; nameTh: string }>;
    vulnerabilityTypes: Array<{ id: string; nameTh: string }>;
  };
}

const MAX_READ_ROWS = 5000;

function safeDecrypt(value: string | null): string {
  if (!value) return "";
  try {
    return decryptText(value, getKeyring());
  } catch {
    return "(ไม่สามารถแสดงข้อมูลได้)";
  }
}

function addressText(input: {
  houseNo: string | null;
  mooNo: number | null;
  soi: string | null;
  road: string | null;
  tambon: string;
}): string {
  return [
    input.houseNo ? `บ้านเลขที่ ${input.houseNo}` : null,
    input.mooNo != null && input.mooNo > 0 ? `หมู่ ${input.mooNo}` : null,
    input.soi ? `ซอย ${input.soi}` : null,
    input.road ? `ถนน ${input.road}` : null,
    input.tambon ? `ตำบล${input.tambon}` : null,
  ].filter(Boolean).join(" ");
}

export function canViewMedicalCases(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.MEDICAL_CASE_VIEW);
}

export async function getMedicalCases(
  ctx: AuthorizationContext,
  filters: MedicalCaseFilters,
  requestedPage?: number | string,
  requestedSize?: number | string,
): Promise<MedicalCaseListResult | null> {
  if (!canViewMedicalCases(ctx)) return null;

  const page = normalizePage(requestedPage);
  const pageSize = normalizePageSize(requestedSize);
  const [people, communities, tambons, vulnerabilityTypes] = await Promise.all([
    prisma.vulnerablePerson.findMany({
      where: {
        isActive: true,
        ...(filters.vulnerabilityTypeId
          ? { vulnerabilities: { some: { vulnerabilityTypeId: filters.vulnerabilityTypeId } } }
          : {}),
        household: {
          deletedAt: null,
          OR: [
            { duplicateResolution: null },
            { duplicateResolution: DuplicateResolutionEnum.NOT_DUPLICATE },
          ],
          sheet: { status: SheetStatus.VERIFIED },
          ...(filters.communityId ? { communityId: filters.communityId } : {}),
          ...(filters.tambonId ? { tambonId: filters.tambonId } : {}),
        },
      },
      take: MAX_READ_ROWS + 1,
      select: {
        id: true,
        seq: true,
        firstName: true,
        lastName: true,
        phone: true,
        prefixOther: true,
        nameStatus: true,
        age: true,
        ageMonths: true,
        triageLevel: true,
        namePrefix: { select: { nameTh: true } },
        vulnerabilities: {
          select: {
            detail: true,
            vulnerabilityType: { select: { nameTh: true, basePriority: true } },
          },
          orderBy: { vulnerabilityType: { sortOrder: "asc" } },
        },
        household: {
          select: {
            houseNo: true,
            mooNo: true,
            soi: true,
            road: true,
            latitude: true,
            longitude: true,
            surveyedAt: true,
            respondentPhone: true,
            mentalHealthSupport: true,
            community: { select: { nameTh: true } },
            tambon: { select: { nameTh: true } },
            sheet: { select: { sheetNo: true } },
            assistanceNeeds: {
              select: {
                personCount: true,
                detail: true,
                needType: { select: { nameTh: true } },
              },
              orderBy: { needType: { sortOrder: "asc" } },
            },
          },
        },
      },
    }),
    prisma.community.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, nameTh: true },
      orderBy: { code: "asc" },
    }),
    prisma.tambon.findMany({
      select: { id: true, nameTh: true },
      orderBy: { code: "asc" },
    }),
    prisma.vulnerabilityType.findMany({
      where: { isActive: true },
      select: { id: true, nameTh: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const truncated = people.length > MAX_READ_ROWS;
  const normalizedSearch = filters.search?.trim().toLocaleLowerCase("th-TH") ?? "";
  const mapped: MedicalCaseRow[] = people.slice(0, MAX_READ_ROWS).map((person) => {
    const household = person.household;
    const level = effectiveTriage(
      person.triageLevel as TriageCode | null,
      person.vulnerabilities.map((item) => item.vulnerabilityType.basePriority as TriageCode),
    );
    const fullName = assemblePersonName(
      person.namePrefix?.nameTh ?? person.prefixOther ?? "",
      safeDecrypt(person.firstName),
      safeDecrypt(person.lastName),
      person.nameStatus,
    );
    const vulnerabilities = formatDiseases(person.vulnerabilities.map((item) => ({
      nameTh: item.vulnerabilityType.nameTh,
      detail: safeDecrypt(item.detail),
    })));
    const assistance = household.assistanceNeeds.map((need) => {
      const count = need.personCount != null ? ` ${need.personCount} คน` : "";
      const detail = safeDecrypt(need.detail);
      return `${need.needType.nameTh}${count}${detail ? ` (${detail})` : ""}`;
    }).join("; ");
    const tambon = household.tambon?.nameTh ?? "";
    return {
      personId: person.id,
      sheetNo: household.sheet.sheetNo,
      fullName,
      ageText: formatAge(person.age, person.ageMonths),
      phone: safeDecrypt(person.phone) || safeDecrypt(household.respondentPhone),
      triage: level,
      triageLabel: triageLabel(level),
      vulnerabilities,
      assistance,
      mentalHealthSupport: household.mentalHealthSupport,
      address: addressText({
        houseNo: household.houseNo,
        mooNo: household.mooNo,
        soi: household.soi,
        road: household.road,
        tambon,
      }),
      community: household.community.nameTh,
      tambon,
      surveyedAt: household.surveyedAt,
      mapsUrl: household.latitude != null && household.longitude != null
        ? `https://www.google.com/maps?q=${household.latitude.toString()},${household.longitude.toString()}`
        : null,
    };
  }).filter((row) => {
    if (filters.triage === "UNASSESSED" && row.triage != null) return false;
    if (filters.triage && filters.triage !== "UNASSESSED" && row.triage !== filters.triage) return false;
    if (!normalizedSearch) return true;
    return [row.sheetNo, row.fullName, row.phone, row.address, row.community]
      .some((value) => value.toLocaleLowerCase("th-TH").includes(normalizedSearch));
  });

  const priority: Record<TriageCode, number> = { P1: 3, P2: 2, P3: 1 };
  mapped.sort((a, b) => {
    const triageDiff = (b.triage ? priority[b.triage] : 0) - (a.triage ? priority[a.triage] : 0);
    if (triageDiff !== 0) return triageDiff;
    return a.community.localeCompare(b.community, "th") || a.address.localeCompare(b.address, "th");
  });

  const summary = {
    total: mapped.length,
    critical: mapped.filter((row) => row.triage === "P1").length,
    urgent: mapped.filter((row) => row.triage === "P2").length,
    watch: mapped.filter((row) => row.triage === "P3").length,
    unassessed: mapped.filter((row) => row.triage == null).length,
    mentalHealth: mapped.filter((row) => row.mentalHealthSupport === true).length,
  };
  const totalPages = Math.max(1, Math.ceil(mapped.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const rows = mapped.slice(start, start + pageSize);

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "MedicalCaseRegistry",
    changes: {
      resultCount: rows.length,
      matchedCount: mapped.length,
      filtered: Boolean(filters.search || filters.communityId || filters.tambonId || filters.triage || filters.vulnerabilityTypeId),
    },
    reason: "view-verified-medical-cases",
  });

  return {
    rows,
    total: mapped.length,
    page: currentPage,
    pageSize,
    truncated,
    summary,
    options: { communities, tambons, vulnerabilityTypes },
  };
}
