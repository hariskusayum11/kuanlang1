import { prisma } from "../prisma";
import { fetchDashboardCounts, type DashboardCounts } from "./stats";

export type DashboardScope = {
  isGlobalScope: boolean;
  communityIds: string[];
};

const ZERO_COUNTS: DashboardCounts = {
  communities: 0,
  tambons: 0,
  moos: 0,
  households: 0,
  evacuationSites: 0,
};

/**
 * ตัวเลข Dashboard ตาม Community Scope ของผู้ใช้ (read-only)
 * - Global scope (ADMIN/EXECUTIVE) → นับทั้งระบบ
 * - Scope ว่าง → คืน 0 ทั้งหมด (ห้าม fallback เป็น global เด็ดขาด)
 * - Moo ไม่มี FK ไปชุมชน → นับผ่านตำบล (distinct) ของชุมชนใน scope
 */
export async function fetchScopedDashboardCounts(
  scope: DashboardScope,
): Promise<DashboardCounts> {
  if (scope.isGlobalScope) return fetchDashboardCounts();
  if (scope.communityIds.length === 0) return { ...ZERO_COUNTS };

  const ids = scope.communityIds;

  const [communities, communityTambons, households, evacuationSites] =
    await Promise.all([
      prisma.community.count({
        where: { id: { in: ids }, deletedAt: null },
      }),
      prisma.communityTambon.findMany({
        where: { communityId: { in: ids } },
        select: { tambonId: true },
      }),
      prisma.household.count({ where: { communityId: { in: ids } } }),
      prisma.evacuationSite.count({ where: { communityId: { in: ids } } }),
    ]);

  const tambonIds = [...new Set(communityTambons.map((ct) => ct.tambonId))];
  const moos =
    tambonIds.length === 0
      ? 0
      : await prisma.moo.count({ where: { tambonId: { in: tambonIds } } });

  return {
    communities,
    tambons: tambonIds.length,
    moos,
    households,
    evacuationSites,
  };
}
