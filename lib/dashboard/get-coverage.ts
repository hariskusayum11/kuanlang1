import { SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import type { DashboardScope } from "./get-dashboard-stats";
import {
  buildCommunityCoverage,
  summarizeCoverage,
  type CommunityCoverageRow,
  type CoverageSummary,
} from "./coverage";

export interface CommunityCoverageResult {
  rows: CommunityCoverageRow[];
  summary: CoverageSummary;
}

/**
 * Verified/Survey Coverage รายชุมชน ตาม Community Scope ของผู้ใช้ (read-only, ไม่มี PII)
 * - Global scope → ทุกชุมชน · Scope ว่าง → ว่าง (ห้าม fallback เป็นทั้งระบบ)
 * - นับด้วย groupBy ฝั่ง DB (คงที่แม้ครัวเรือนหลักหมื่น) · ไม่นับ soft-deleted/ซ้ำ
 */
export async function fetchCommunityCoverage(
  scope: DashboardScope,
): Promise<CommunityCoverageResult> {
  if (!scope.isGlobalScope && scope.communityIds.length === 0) {
    return { rows: [], summary: summarizeCoverage([]) };
  }

  const communities = await prisma.community.findMany({
    where: scope.isGlobalScope
      ? { deletedAt: null }
      : { deletedAt: null, id: { in: scope.communityIds } },
    orderBy: { code: "asc" },
    select: {
      id: true,
      code: true,
      nameTh: true,
      totalHouseholds: true,
      targetCoveragePercent: true,
    },
  });
  if (communities.length === 0) return { rows: [], summary: summarizeCoverage([]) };

  const ids = communities.map((c) => c.id);
  // ไม่นับ soft-deleted หรือใบสงสัยซ้ำ เป็น Coverage (CLAUDE.md)
  const baseWhere = { communityId: { in: ids }, deletedAt: null, hasDuplicateFlag: false };
  const [surveyedGroups, verifiedGroups] = await Promise.all([
    prisma.household.groupBy({ by: ["communityId"], where: baseWhere, _count: { _all: true } }),
    prisma.household.groupBy({
      by: ["communityId"],
      where: { ...baseWhere, sheet: { status: SheetStatus.VERIFIED } },
      _count: { _all: true },
    }),
  ]);

  const surveyedBy = new Map(surveyedGroups.map((g) => [g.communityId, g._count._all]));
  const verifiedBy = new Map(verifiedGroups.map((g) => [g.communityId, g._count._all]));

  const rows = communities.map((c) =>
    buildCommunityCoverage({
      communityId: c.id,
      code: c.code,
      nameTh: c.nameTh,
      totalHouseholds: c.totalHouseholds,
      targetCoveragePercent: c.targetCoveragePercent,
      surveyed: surveyedBy.get(c.id) ?? 0,
      verified: verifiedBy.get(c.id) ?? 0,
    }),
  );

  return { rows, summary: summarizeCoverage(rows) };
}
