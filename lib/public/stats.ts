// Public data layer — ข้อมูลสาธารณะเท่านั้น (ไม่ต้อง login)
// กติกา (CLAUDE.md + docs/26): ห้ามคืน PII, พิกัดรายบ้าน, Household/Sheet ID
// ทุกฟังก์ชันคืนเฉพาะ aggregate ระดับพื้นที่ หรือข้อมูลราชการที่เผยแพร่ได้

import { SheetStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { BOUNDARY_PRECISION, getBoundaryStats, getCurrentCommunityBoundaries } from "../geo/community-boundaries";
import { squareMetersToRai } from "../../domain/geo/community-summary";
import { buildFloodGrid, type FloodGridCell } from "../../domain/geo/flood-grid";
import { calculateFloodDepthCm } from "../../domain/flood/depth";
import { buildUsableHouseholdWhere } from "../household/trusted-where";
import { communityMarkerPosition, type LngLat } from "../../domain/geo/community-boundary";

/**
 * k-anonymity threshold — aggregate เกี่ยวกับ "กลุ่มคน" (เช่น กลุ่มเปราะบางรายพื้นที่)
 * ต่ำกว่าเกณฑ์นี้ต้อง suppress กันการย้อนระบุตัวบุคคล
 * ยังไม่มีข้อมูลจริงให้แสดงรอบนี้ — ประกาศไว้เป็นกติกากลางสำหรับทุก public aggregation
 */
export const PUBLIC_MIN_AGGREGATE = 5;

/**
 * จัดรูปตัวเลข aggregate หมวดอ่อนไหว (นับ "กลุ่มคน" เช่น ผู้ป่วยติดเตียงรายพื้นที่)
 * สำหรับแสดงสาธารณะ — Pure function ใช้กับทุกจุดที่จะแสดงตัวเลขหมวดนี้ในอนาคต
 *
 * กติกาเข้มกว่า threshold ปกติ: ค่า 0..(N-1) แสดงเป็น "น้อยกว่า N" ทั้งหมด
 * (ไม่แยก 0 ออก — การยืนยันว่า "มี/ไม่มี" ในพื้นที่เล็กก็เป็น inference risk ต่อข้อมูลสุขภาพ)
 * หมวดไม่อ่อนไหว (นับสถานที่/ครัวเรือนรวมระดับเครือข่าย) แสดงตรงได้ ไม่ต้องผ่านฟังก์ชันนี้
 */
export function formatSensitiveAggregate(count: number): string {
  const safe = Math.max(0, Math.floor(count));
  if (safe < PUBLIC_MIN_AGGREGATE) return `น้อยกว่า ${PUBLIC_MIN_AGGREGATE}`;
  return safe.toLocaleString("th-TH");
}

export interface PublicStats {
  communities: number;
  tambons: number;
  /** นับเฉพาะใบที่ VERIFIED แล้วเท่านั้น (FR-RSK-07) — ไม่นับ draft/กำลังตรวจ */
  verifiedHouseholds: number;
  evacuationSites: number;
  generatedAt: Date;
}

export async function getPublicStats(): Promise<PublicStats> {
  const [communities, tambonLinks, verifiedHouseholds, evacuationSites] =
    await Promise.all([
      prisma.community.count({ where: { deletedAt: null, isActive: true } }),
      prisma.communityTambon.findMany({
        where: { community: { deletedAt: null, isActive: true } },
        select: { tambonId: true },
        distinct: ["tambonId"],
      }),
      prisma.household.count({
        where: { deletedAt: null, sheet: { status: SheetStatus.VERIFIED } },
      }),
      prisma.evacuationSite.count({ where: { isActive: true, isPublic: true } }),
    ]);

  return {
    communities,
    tambons: tambonLinks.length,
    verifiedHouseholds,
    evacuationSites,
    generatedAt: new Date(),
  };
}

export interface PublicEmergencyContact {
  id: string;
  nameTh: string;
  phone: string;
  category: string;
  isNationwide: boolean;
}

export interface PublicMapCommunity {
  id: string;
  nameTh: string;
  /** ตำแหน่งหมุดชุมชน — จุดภายในขอบเขตจริงถ้ามี ไม่งั้นเป็น centroid โดยประมาณ */
  lat: number;
  lng: number;
  positionSource: "BOUNDARY" | "CENTROID";
  /** เส้นขอบชุมชน (GeoJSON MultiPolygon coordinates) — ระดับชุมชน ไม่ใช่รายบ้าน */
  boundary: LngLat[][][] | null;
  /** ขอบเขตผ่านการรับรองแล้วหรือยัง (ชุดแรกยังเป็นร่าง) */
  boundaryApproved: boolean;
  /**
   * กล่องข้อมูลเมื่อกดชุมชน (docs/35) — **ไม่มีตัวเลขกลุ่มเปราะบาง/สุขภาพโดยตั้งใจ**
   * ชุมชนเล็ก ตัวเลขอย่าง "ผู้ป่วยติดเตียง 2 คน" คนในพื้นที่เดาตัวได้ แม้เป็นตัวเลขรวม
   */
  summary: {
    /** null = ไม่มีขอบเขต จึงไม่ทราบพื้นที่ */
    areaRai: number | null;
    /** ครัวเรือนที่สำรวจและตรวจแล้ว (ไม่นับใบที่ยังไม่ตรวจ/ใบซ้ำ) */
    verifiedHouseholds: number;
    /** จุดอพยพที่อยู่ในเขตจริง — สถานที่สาธารณะ */
    sites: Array<{ name: string; lat: number; lng: number }>;
  };
}

export interface PublicMapSite {
  id: string;
  name: string;
  type: string | null;
  lat: number;
  lng: number;
}

export interface PublicMapData {
  communities: PublicMapCommunity[];
  sites: PublicMapSite[];
  /** ช่องพื้นที่ ~200 ม. ที่มีครัวเรือน ≥ 5 หลัง — ไม่มีพิกัดรายบ้าน (docs/39) */
  floodGrid: FloodGridCell[];
  /** เวลาที่ดึงข้อมูล — แสดง "ข้อมูล ณ วันที่" */
  generatedAt: string;
}

/**
 * ข้อมูลแผนที่สาธารณะ — เฉพาะ aggregate/สถานที่สาธารณะเท่านั้น
 *  - ชุมชน: เส้นขอบชุมชน + จุดภายในขอบเขต (หรือ centroid โดยประมาณ) ไม่ใช่พิกัดรายบ้าน
 *    ไม่ส่ง source/version ของขอบเขต — ส่งเฉพาะที่ต้องวาด เพื่อให้ payload เล็กบนเน็ตช้า
 *  - จุดอพยพ/พักพิง: ชื่อ + ประเภท + พิกัด (ไม่คืนชื่อ/เบอร์ผู้ประสานงาน = ไม่มี PII)
 */
export async function getPublicMapData(): Promise<PublicMapData> {
  const [communities, boundaries, sites, boundaryStats, verifiedGroups, floodRows] = await Promise.all([
    prisma.community.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, nameTh: true, centroidLat: true, centroidLng: true },
      orderBy: { code: "asc" },
    }),
    getCurrentCommunityBoundaries({ precision: BOUNDARY_PRECISION.public }),
    // บ้านพักพิงที่เจ้าของไม่ยินยอมเผยแพร่ ต้องไม่ปรากฏบนหน้าสาธารณะ (docs/38)
    prisma.evacuationSite.findMany({
      where: { isActive: true, isPublic: true },
      select: { id: true, name: true, type: true, latitude: true, longitude: true },
      orderBy: { name: "asc" },
    }),
    getBoundaryStats({ publicOnly: true }),
    // นับแบบเดียวกับ Verified Coverage ของแดชบอร์ด (ไม่นับ soft-deleted/ใบสงสัยซ้ำ)
    prisma.household.groupBy({
      by: ["communityId"],
      where: { deletedAt: null, hasDuplicateFlag: false, sheet: { status: SheetStatus.VERIFIED } },
      _count: { _all: true },
    }),
    // แผนที่ความรุนแรง: ดึงพิกัดมาคำนวณฝั่ง server เท่านั้น — ส่งออกแค่กรอบช่องและค่าเฉลี่ย (docs/39)
    prisma.household.findMany({
      where: {
        AND: [
          buildUsableHouseholdWhere({ status: "VERIFIED" }),
          { latitude: { not: null } },
          { longitude: { not: null } },
        ],
      },
      select: {
        latitude: true,
        longitude: true,
        floodRiskProfile: {
          select: {
            floorLevelVsRoad: true,
            floodDepthMetersRaw: true,
            floodDepthCmRaw: true,
            maxFloodDepthCm: true,
            lastFloodDurationDays: true,
          },
        },
      },
    }),
  ]);
  const floodGrid = buildFloodGrid(
    floodRows.map((h) => {
      const p = h.floodRiskProfile;
      return {
        lat: Number(h.latitude),
        lng: Number(h.longitude),
        depthCm: p ? (calculateFloodDepthCm(p.floodDepthMetersRaw, p.floodDepthCmRaw) ?? p.maxFloodDepthCm) : null,
        belowRoad: p?.floorLevelVsRoad ? p.floorLevelVsRoad === "BELOW_ROAD" : null,
        durationDays: p?.lastFloodDurationDays ?? null,
      };
    }),
  );
  const verifiedBy = new Map(verifiedGroups.map((g) => [g.communityId, g._count._all]));

  const boundaryById = new Map(boundaries.map((b) => [b.communityId, b]));
  const mapCommunities: PublicMapCommunity[] = [];
  for (const c of communities) {
    const boundary = boundaryById.get(c.id);
    const centroid = c.centroidLat === null || c.centroidLng === null
      ? null
      : { lat: Number(c.centroidLat), lng: Number(c.centroidLng) };
    const position = communityMarkerPosition(boundary?.labelPoint, centroid);
    if (!position) continue;
    mapCommunities.push({
      id: c.id,
      nameTh: c.nameTh,
      lat: position.lat,
      lng: position.lng,
      positionSource: position.source,
      boundary: boundary?.geometry.coordinates ?? null,
      boundaryApproved: boundary?.isApproved ?? false,
      summary: {
        areaRai: squareMetersToRai(boundaryStats.get(c.id)?.areaSquareMeters),
        verifiedHouseholds: verifiedBy.get(c.id) ?? 0,
        sites: (boundaryStats.get(c.id)?.sites ?? []).map((s) => ({ name: s.name, lat: s.lat, lng: s.lng })),
      },
    });
  }

  return {
    communities: mapCommunities,
    sites: sites.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      lat: Number(s.latitude),
      lng: Number(s.longitude),
    })),
    floodGrid,
    generatedAt: new Date().toISOString(),
  };
}

/** เบอร์ติดต่อฉุกเฉินราชการ (Master Data ที่เผยแพร่ได้ — ไม่ใช่ข้อมูลบุคคล) */
export async function getPublicEmergencyContacts(): Promise<
  PublicEmergencyContact[]
> {
  const contacts = await prisma.emergencyContact.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { nameTh: "asc" }],
    select: {
      id: true,
      nameTh: true,
      phone: true,
      category: true,
      isNationwide: true,
    },
    take: 20,
  });
  return contacts;
}
