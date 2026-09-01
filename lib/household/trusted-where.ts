import {
  DuplicateResolutionEnum,
  Prisma,
  SheetStatus,
} from "@prisma/client";

export type SurveyStatusFilter = "VERIFIED" | "PENDING" | "ALL";

export interface HouseholdAnalyticsFilters {
  communityId?: string;
  tambonId?: string;
  dateFrom?: string;
  dateTo?: string;
  status: SurveyStatusFilter;
}

function validDate(value?: string): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

/** ตรวจช่วงวันที่ก่อน query เพื่อไม่ให้ช่วงกลับด้านแสดงยอดศูนย์แบบชวนเข้าใจผิด */
export function dateRangeError(dateFrom?: string, dateTo?: string): string | null {
  const from = validDate(dateFrom);
  const to = validDate(dateTo);
  if (dateFrom && !from) return "วันที่เริ่มต้นไม่ถูกต้อง";
  if (dateTo && !to) return "วันที่สิ้นสุดไม่ถูกต้อง";
  if (from && to && from > to) return "วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด";
  return null;
}

/** ใบที่ใช้งานได้: ไม่ถูกลบ และไม่ถูกผู้ตรวจยืนยันว่าเป็นใบซ้ำจริง */
export function buildUsableHouseholdWhere(
  filters: HouseholdAnalyticsFilters,
  communityIds?: readonly string[],
): Prisma.HouseholdWhereInput {
  const from = validDate(filters.dateFrom);
  const to = validDate(filters.dateTo);
  if (to) to.setUTCDate(to.getUTCDate() + 1);

  const statusWhere: Prisma.HouseholdWhereInput =
    filters.status === "VERIFIED"
      ? { sheet: { status: SheetStatus.VERIFIED } }
      : filters.status === "PENDING"
        ? { sheet: { status: { not: SheetStatus.VERIFIED } } }
        : {};

  return {
    AND: [
      { deletedAt: null },
      { OR: [
        { duplicateResolution: null },
        { duplicateResolution: DuplicateResolutionEnum.NOT_DUPLICATE },
      ] },
      ...(communityIds ? [{ communityId: { in: [...communityIds] } }] : []),
      ...(filters.communityId ? [{ communityId: filters.communityId }] : []),
      ...(filters.tambonId ? [{ tambonId: filters.tambonId }] : []),
      ...(from || to ? [{ surveyedAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lt: to } : {}),
      } }] : []),
      statusWhere,
    ],
  };
}

/** เกณฑ์บังคับสำหรับจุดบ้านบนแผนที่ — แสดงเฉพาะใบ VERIFIED */
export function buildVerifiedMapHouseholdWhere(
  filters: Omit<HouseholdAnalyticsFilters, "status">,
  communityIds?: readonly string[],
): Prisma.HouseholdWhereInput {
  return buildUsableHouseholdWhere(
    { ...filters, status: "VERIFIED" },
    communityIds,
  );
}
