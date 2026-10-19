// ขอบเขตชุมชนปัจจุบัน (community_boundary) → GeoJSON สำหรับแผนที่
// ---------------------------------------------------------------------------
// geom เป็น Unsupported ใน Prisma จึงอ่านผ่าน raw SQL (ST_AsGeoJSON)
// ข้อมูลระดับชุมชนเท่านั้น ไม่มีพิกัดรายบ้าน/PII — ใช้ได้ทั้งแผนที่ภายในและแผนที่สาธารณะ
//
// "ปัจจุบัน" = effectiveTo IS NULL (นำเข้าด้วย scripts/import-boundaries.ts ซึ่งปิดเวอร์ชันเก่า)
// ถ้ามีหลายแถวค้างโดยไม่ตั้งใจ ใช้เวอร์ชันสูงสุด (DISTINCT ON)
//
// ขอบเขตชุดแรก (2026-10-19) ยังเป็นร่างที่ไม่ได้รับรอง (isApproved=false) — UI ต้องบอกผู้ใช้เสมอ

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { parseBoundaryGeometry, validLatLng, type BoundaryMultiPolygon, type LatLng } from "../../domain/geo/community-boundary";

export interface CommunityBoundaryShape {
  communityId: string;
  code: string;
  nameTh: string;
  version: number;
  isApproved: boolean;
  source: string | null;
  geometry: BoundaryMultiPolygon;
  /** จุดที่รับประกันว่าอยู่ในขอบเขต (ST_PointOnSurface) ใช้วางหมุด/ป้ายชื่อชุมชน */
  labelPoint: LatLng | null;
}

/**
 * ความละเอียดของรูปทรง
 *  - simplify 0.00002° ≈ 2 ม. — ตัดจุดซ้อนจากการวาดมือโดยไม่เปลี่ยนรูปร่างที่มองเห็น
 *  - ทศนิยม 6 ตำแหน่ง ≈ 0.1 ม. (ภายใน) · 5 ตำแหน่ง ≈ 1 ม. (สาธารณะ — ลด payload บนเน็ตช้า)
 */
const SIMPLIFY_TOLERANCE_DEG = 0.00002;
export const BOUNDARY_PRECISION = { internal: 6, public: 5 } as const;

type Row = {
  communityId: string;
  code: string;
  nameTh: string;
  version: number;
  isApproved: boolean;
  source: string | null;
  geojson: string | null;
  labelLat: number | null;
  labelLng: number | null;
};

export async function getCurrentCommunityBoundaries(
  options: { communityIds?: string[]; precision?: number } = {},
): Promise<CommunityBoundaryShape[]> {
  const precision = Math.min(8, Math.max(4, Math.trunc(options.precision ?? BOUNDARY_PRECISION.internal)));
  const scope = options.communityIds
    ? options.communityIds.length
      ? Prisma.sql`AND c.id IN (${Prisma.join(options.communityIds)})`
      : Prisma.sql`AND FALSE`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT DISTINCT ON (c.id)
      c.id AS "communityId",
      c.code,
      c."nameTh",
      cb.version,
      cb."isApproved",
      cb.source,
      ST_AsGeoJSON(ST_SimplifyPreserveTopology(cb.geom::geometry, ${SIMPLIFY_TOLERANCE_DEG}), ${precision}::int) AS geojson,
      ST_Y(ST_PointOnSurface(cb.geom::geometry)) AS "labelLat",
      ST_X(ST_PointOnSurface(cb.geom::geometry)) AS "labelLng"
    FROM community_boundary cb
    JOIN community c ON c.id = cb."communityId"
    WHERE cb."effectiveTo" IS NULL
      AND cb.geom IS NOT NULL
      AND c."deletedAt" IS NULL
      AND c."isActive" = TRUE
      ${scope}
    ORDER BY c.id, cb.version DESC
  `);

  const shapes: CommunityBoundaryShape[] = [];
  for (const row of rows) {
    const geometry = parseBoundaryGeometry(row.geojson);
    if (!geometry) continue;
    shapes.push({
      communityId: row.communityId,
      code: row.code,
      nameTh: row.nameTh,
      version: Number(row.version),
      isApproved: row.isApproved,
      source: row.source,
      geometry,
      labelPoint: validLatLng(row.labelLat === null ? null : Number(row.labelLat), row.labelLng === null ? null : Number(row.labelLng)),
    });
  }
  return shapes.sort((a, b) => a.code.localeCompare(b.code));
}
