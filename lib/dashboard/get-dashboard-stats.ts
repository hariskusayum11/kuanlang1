import {
  fetchDashboardCounts,
  fetchScopedCounts,
  type DashboardCounts,
} from "./stats";

export type DashboardScope = {
  isGlobalScope: boolean;
  communityIds: string[];
};

const ZERO_COUNTS: DashboardCounts = {
  communities: 0,
  keyed: 0,
  verified: 0,
  pending: 0,
  keyers: 0,
};

/**
 * ตัวเลข Dashboard ตาม Community Scope ของผู้ใช้ (read-only)
 * - Global scope (ค่าปกติหลัง #R7-B: ทุกบัญชี) → นับทั้งระบบ
 * - Scope ว่าง → คืน 0 ทั้งหมด (ห้าม fallback เป็น global เด็ดขาด)
 */
export async function fetchScopedDashboardCounts(
  scope: DashboardScope,
): Promise<DashboardCounts> {
  if (scope.isGlobalScope) return fetchDashboardCounts();
  if (scope.communityIds.length === 0) return { ...ZERO_COUNTS };
  return fetchScopedCounts(scope.communityIds);
}
