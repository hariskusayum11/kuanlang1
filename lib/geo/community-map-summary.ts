import type { CoverageResult } from "../../domain/coverage/coverage";
import {
  EMPTY_VULNERABLE_SUMMARY,
  squareMetersToRai,
  summarizeVulnerableByCommunity,
  type CommunityVulnerableSummary,
} from "../../domain/geo/community-summary";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { fetchCommunityCoverage } from "../dashboard/get-coverage";
import { buildUsableHouseholdWhere } from "../household/trusted-where";
import { prisma } from "../prisma";
import { getBoundaryStats } from "./community-boundaries";

// กล่องข้อมูลชุมชนบนแผนที่ภายใน (docs/35) — ตัวเลขรวมระดับชุมชน ไม่มีข้อมูลรายบ้าน
//
// ทุกตัวเลขนับจาก "ใบที่ตรวจแล้ว" ยกเว้น surveyed/pending ที่ต้องรวมใบรอตรวจโดยนิยาม
// ไม่มีคะแนนความเสี่ยงโดยตั้งใจ: เกณฑ์ยังเป็นร่าง และหน้า /risk คำนวณได้ครั้งละไม่เกิน
// RISK_LIST_LIMIT ครัวเรือน — ตัวเลขรายชุมชนจากชุดที่ถูกตัดจะผิดโดยไม่มีใครรู้

export interface CommunityMapSummary {
  communityId: string;
  surveyed: number;
  verified: number;
  pending: number;
  totalHouseholds: number | null;
  targetCoveragePercent: number;
  verifiedCoverage: CoverageResult;
  vulnerable: CommunityVulnerableSummary;
  areaRai: number | null;
  siteCount: number;
}

export interface CommunityMapSummaryResult {
  summaries: Record<string, CommunityMapSummary>;
  /** เวลาที่ดึงข้อมูล — แสดงเป็น "ข้อมูล ณ วันที่" */
  generatedAt: string;
}

export async function getCommunityMapSummaries(
  ctx: AuthorizationContext,
): Promise<CommunityMapSummaryResult> {
  const generatedAt = new Date().toISOString();
  if (!hasPermission(ctx, PERMISSIONS.MAP_VIEW)) return { summaries: {}, generatedAt };

  const [coverage, persons, boundaryStats] = await Promise.all([
    fetchCommunityCoverage({ isGlobalScope: ctx.isGlobalScope, communityIds: ctx.communityIds }),
    prisma.vulnerablePerson.findMany({
      where: {
        household: buildUsableHouseholdWhere(
          { status: "VERIFIED" },
          ctx.isGlobalScope ? undefined : ctx.communityIds,
        ),
      },
      select: {
        isActive: true,
        household: { select: { communityId: true } },
        vulnerabilities: {
          select: { vulnerabilityType: { select: { nameTh: true, sortOrder: true } } },
        },
      },
    }),
    getBoundaryStats(),
  ]);

  const vulnerable = summarizeVulnerableByCommunity(
    persons.map((p) => ({
      communityId: p.household.communityId,
      isActive: p.isActive,
      types: p.vulnerabilities.map((v) => ({
        name: v.vulnerabilityType.nameTh,
        sortOrder: v.vulnerabilityType.sortOrder,
      })),
    })),
  );

  const summaries: Record<string, CommunityMapSummary> = {};
  for (const row of coverage.rows) {
    const stats = boundaryStats.get(row.communityId);
    summaries[row.communityId] = {
      communityId: row.communityId,
      surveyed: row.surveyed,
      verified: row.verified,
      pending: Math.max(0, row.surveyed - row.verified),
      totalHouseholds: row.totalHouseholds,
      targetCoveragePercent: row.targetCoveragePercent,
      verifiedCoverage: row.verifiedCoverage,
      vulnerable: vulnerable.get(row.communityId) ?? EMPTY_VULNERABLE_SUMMARY,
      areaRai: squareMetersToRai(stats?.areaSquareMeters),
      siteCount: stats?.sites.length ?? 0,
    };
  }
  return { summaries, generatedAt };
}
