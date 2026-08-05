// Survey Map core — ภาพรวมการสำรวจระดับชุมชนบนแผนที่
// ---------------------------------------------------------------------------
// กติกา (CLAUDE.md):
// - RBAC ฝั่ง server (household.view)
// - Privacy: aggregate ระดับ "ชุมชน" เท่านั้น — ไม่มีพิกัดรายบ้าน/PII
//   ใช้จุดศูนย์กลางชุมชนโดยประมาณ (Community.centroid*) วางหมุด
// - นับ "คีย์แล้ว" = ทุกใบที่คีย์ (ยังไม่ลบ) · "ตรวจแล้ว" = VERIFIED (นิยาม Verified Coverage)
// - Coverage NULL-aware ผ่าน domain/coverage (ห้ามคืน 0% เมื่อไม่ทราบ denominator)
// - Audit READ ทุกครั้ง

import { AuditAction, Prisma, SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { writeAuditLog } from "../audit/log";
import { hasPermission } from "../authz/access";
import { PERMISSIONS } from "../authz/permissions";
import type { AuthorizationContext } from "../authz/types";
import { calculateCoverage } from "@/domain/coverage/coverage";

export function canViewSurveyMap(ctx: AuthorizationContext): boolean {
  return hasPermission(ctx, PERMISSIONS.HOUSEHOLD_VIEW);
}

export interface SurveyMapPoint {
  communityId: string;
  code: string;
  nameTh: string;
  /** null = ยังไม่กำหนดตำแหน่ง → ไม่ขึ้นบนแผนที่ */
  lat: number | null;
  lng: number | null;
  keyed: number;
  verified: number;
  totalHouseholds: number | null;
  /** null = คำนวณไม่ได้ (ไม่ทราบจำนวนครัวเรือนทั้งหมด) */
  coveragePercent: number | null;
  meetsTarget: boolean | null;
}

/** คุณสมบัติที่ติดไปกับ polygon แต่ละชุมชน (ใช้ระบายสี + popup) */
export interface BoundaryProps {
  communityId: string;
  code: string;
  nameTh: string;
  keyed: number;
  verified: number;
  coveragePercent: number | null;
  meetsTarget: boolean | null;
  /** false = ขอบเขตร่าง/โดยประมาณ ยังไม่รับรอง */
  approved: boolean;
}
export interface BoundaryFeature {
  type: "Feature";
  geometry: unknown; // GeoJSON geometry จาก ST_AsGeoJSON
  properties: BoundaryProps;
}
export interface BoundaryFeatureCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}

export interface SurveyMapResult {
  allowed: boolean;
  points: SurveyMapPoint[];
  /** ขอบเขตชุมชน (choropleth) — ว่างถ้ายังไม่มี polygon */
  boundaries: BoundaryFeatureCollection;
  totalKeyed: number;
  totalVerified: number;
  /** ค่ากลางแผนที่ (เฉลี่ยจากชุมชนที่มีพิกัด) — fallback หาดใหญ่ */
  center: { lat: number; lng: number };
}

const HATYAI_FALLBACK = { lat: 7.0075, lng: 100.42 };

function toNum(d: Prisma.Decimal | null): number | null {
  return d === null ? null : Number(d);
}

/** ดึงชุมชน + จำนวนที่คีย์/ตรวจแล้ว มาประกอบเป็นจุดบนแผนที่ (คำนวณสด) */
export async function getSurveyMap(
  ctx: AuthorizationContext,
): Promise<SurveyMapResult> {
  const emptyFC: BoundaryFeatureCollection = { type: "FeatureCollection", features: [] };
  const base: SurveyMapResult = {
    allowed: false,
    points: [],
    boundaries: emptyFC,
    totalKeyed: 0,
    totalVerified: 0,
    center: HATYAI_FALLBACK,
  };
  if (!canViewSurveyMap(ctx)) return base;

  const [communities, keyedGroups, verifiedGroups] = await Promise.all([
    prisma.community.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true,
        code: true,
        nameTh: true,
        centroidLat: true,
        centroidLng: true,
        totalHouseholds: true,
        targetCoveragePercent: true,
      },
      orderBy: { code: "asc" },
    }),
    prisma.household.groupBy({
      by: ["communityId"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.household.groupBy({
      by: ["communityId"],
      where: {
        deletedAt: null,
        hasDuplicateFlag: false,
        sheet: { status: SheetStatus.VERIFIED },
      },
      _count: { _all: true },
    }),
  ]);

  const keyedBy = new Map(keyedGroups.map((g) => [g.communityId, g._count._all]));
  const verifiedBy = new Map(verifiedGroups.map((g) => [g.communityId, g._count._all]));

  let totalKeyed = 0;
  let totalVerified = 0;
  let sumLat = 0;
  let sumLng = 0;
  let withCoords = 0;

  const points: SurveyMapPoint[] = communities.map((c) => {
    const keyed = keyedBy.get(c.id) ?? 0;
    const verified = verifiedBy.get(c.id) ?? 0;
    totalKeyed += keyed;
    totalVerified += verified;

    const lat = toNum(c.centroidLat);
    const lng = toNum(c.centroidLng);
    if (lat !== null && lng !== null) {
      sumLat += lat;
      sumLng += lng;
      withCoords += 1;
    }

    const cov = calculateCoverage({
      count: verified,
      totalHouseholds: c.totalHouseholds,
      targetCoveragePercent: c.targetCoveragePercent,
    });

    return {
      communityId: c.id,
      code: c.code,
      nameTh: c.nameTh,
      lat,
      lng,
      keyed,
      verified,
      totalHouseholds: c.totalHouseholds,
      coveragePercent: cov.kind === "CALCULATED" ? cov.percent : null,
      meetsTarget: cov.kind === "CALCULATED" ? cov.meetsTarget : null,
    };
  });

  // ── ขอบเขต choropleth — อ่าน geom (geography) เป็น GeoJSON ผ่าน raw SQL ──────
  // ใช้เฉพาะขอบเขต "ปัจจุบัน" (effectiveTo IS NULL) เวอร์ชันล่าสุดต่อชุมชน
  const geoRows = await prisma.$queryRaw<
    { communityId: string; approved: boolean; gj: string }[]
  >(Prisma.sql`
    SELECT DISTINCT ON (b."communityId")
      b."communityId" AS "communityId",
      b."isApproved"  AS approved,
      ST_AsGeoJSON(b.geom) AS gj
    FROM community_boundary b
    WHERE b."effectiveTo" IS NULL AND b.geom IS NOT NULL
    ORDER BY b."communityId", b.version DESC
  `);

  const pointByCommunity = new Map(points.map((p) => [p.communityId, p]));
  const features: BoundaryFeature[] = [];
  for (const row of geoRows) {
    const p = pointByCommunity.get(row.communityId);
    if (!p) continue;
    let geometry: unknown;
    try {
      geometry = JSON.parse(row.gj);
    } catch {
      continue; // geom เพี้ยน → ข้าม (ไม่ให้ทั้งแผนที่ล้ม)
    }
    features.push({
      type: "Feature",
      geometry,
      properties: {
        communityId: p.communityId,
        code: p.code,
        nameTh: p.nameTh,
        keyed: p.keyed,
        verified: p.verified,
        coveragePercent: p.coveragePercent,
        meetsTarget: p.meetsTarget,
        approved: row.approved,
      },
    });
  }

  await writeAuditLog({
    userId: ctx.userId,
    action: AuditAction.READ,
    entityType: "SurveyMap",
    reason: `เปิดแผนที่ภาพรวมการสำรวจ (${communities.length} ชุมชน, ${features.length} ขอบเขต)`,
  });

  return {
    allowed: true,
    points,
    boundaries: { type: "FeatureCollection", features },
    totalKeyed,
    totalVerified,
    center:
      withCoords > 0 ? { lat: sumLat / withCoords, lng: sumLng / withCoords } : HATYAI_FALLBACK,
  };
}
