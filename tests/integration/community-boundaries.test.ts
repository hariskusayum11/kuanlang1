import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { getCurrentCommunityBoundaries } from "../../lib/geo/community-boundaries";
import { getPublicMapData } from "../../lib/public/stats";

// Integration tests — ขอบเขตชุมชนบนแผนที่ (docs/35)
// พิสูจน์: อ่านเฉพาะเวอร์ชันปัจจุบัน · หมุดชุมชนอยู่ในขอบเขตจริง · ไม่มีขอบเขต → centroid
// · payload สาธารณะมีเฉพาะฟิลด์ที่อนุญาต
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();
const CODES = ["ZZBND1", "ZZBND2"] as const;

// สี่เหลี่ยมรูปตัว L (เว้า) — centroid ทางเรขาคณิตตกนอกรูป แต่ PointOnSurface ต้องอยู่ข้างใน
const L_SHAPE = {
  type: "Polygon",
  coordinates: [[[100.0, 6.0], [100.02, 6.0], [100.02, 6.005], [100.005, 6.005], [100.005, 6.02], [100.0, 6.02], [100.0, 6.0]]],
};
const OLD_SQUARE = {
  type: "Polygon",
  coordinates: [[[101.0, 7.0], [101.01, 7.0], [101.01, 7.01], [101.0, 7.01], [101.0, 7.0]]],
};

async function cleanup() {
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM community_boundary WHERE "communityId" IN (SELECT id FROM community WHERE code IN (${Prisma.join([...CODES])}))
  `);
  await prisma.community.deleteMany({ where: { code: { in: [...CODES] } } });
}

async function insertBoundary(communityId: string, version: number, geometry: object, current: boolean) {
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO community_boundary ("id", "communityId", "version", "geom", "source", "isApproved", "effectiveFrom", "effectiveTo", "createdAt")
    VALUES (${randomUUID()}, ${communityId}, ${version}, ST_Multi(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}))::geography,
      'integration-test', FALSE, now(), ${current ? null : new Date()}, now())
  `);
}

describe.skipIf(!isLocalDevDb)("Integration: ขอบเขตชุมชนบนแผนที่", () => {
  let withBoundary = "";
  let centroidOnly = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const [a, b] = await Promise.all([
      prisma.community.create({ data: { code: CODES[0], nameTh: "ชุมชนทดสอบขอบเขต", centroidLat: 6.5, centroidLng: 100.5 } }),
      prisma.community.create({ data: { code: CODES[1], nameTh: "ชุมชนทดสอบไม่มีขอบเขต", centroidLat: 6.6, centroidLng: 100.6 } }),
    ]);
    withBoundary = a.id;
    centroidOnly = b.id;
    await insertBoundary(withBoundary, 1, OLD_SQUARE, false);
    await insertBoundary(withBoundary, 2, L_SHAPE, true);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("1) คืนเฉพาะเวอร์ชันปัจจุบัน (effectiveTo IS NULL) เป็น MultiPolygon พร้อมจุดภายในขอบเขต", async () => {
    const [shape] = await getCurrentCommunityBoundaries({ communityIds: [withBoundary] });
    expect(shape).toBeDefined();
    expect(shape.version).toBe(2);
    expect(shape.isApproved).toBe(false);
    expect(shape.geometry.type).toBe("MultiPolygon");
    // เวอร์ชันเก่า (ลองจิจูด 101) ต้องไม่หลุดมา
    expect(shape.geometry.coordinates.flat(2).every(([lng]) => lng < 100.1)).toBe(true);
    // ทศนิยมไม่เกิน 6 ตำแหน่ง
    expect(shape.geometry.coordinates.flat(2).flat().every((n) => Number(n.toFixed(6)) === n)).toBe(true);

    const label = shape.labelPoint!;
    const [{ inside }] = await prisma.$queryRaw<{ inside: boolean }[]>(Prisma.sql`
      SELECT ST_Covers(ST_GeomFromGeoJSON(${JSON.stringify(L_SHAPE)}), ST_SetSRID(ST_MakePoint(${label.lng}, ${label.lat}), 4326)) AS inside
    `);
    expect(inside).toBe(true);
  });

  it("2) กรองชุมชน: ไม่มีขอบเขต → ไม่คืน · รายการว่าง → ไม่คืนอะไรเลย (ไม่ใช่ทุกชุมชน)", async () => {
    expect(await getCurrentCommunityBoundaries({ communityIds: [centroidOnly] })).toEqual([]);
    expect(await getCurrentCommunityBoundaries({ communityIds: [] })).toEqual([]);
  });

  it("3) แผนที่สาธารณะ: หมุดอยู่ในขอบเขตเมื่อมีขอบเขต · ไม่มีขอบเขตใช้ centroid · ไม่แก้คอลัมน์ centroid", async () => {
    const data = await getPublicMapData();
    const a = data.communities.find((c) => c.id === withBoundary)!;
    const b = data.communities.find((c) => c.id === centroidOnly)!;
    const [shape] = await getCurrentCommunityBoundaries({ communityIds: [withBoundary] });

    expect(a.positionSource).toBe("BOUNDARY");
    expect(a.lat).toBeCloseTo(shape.labelPoint!.lat, 9);
    expect(a.lng).toBeCloseTo(shape.labelPoint!.lng, 9);
    expect(a.boundary).not.toBeNull();
    expect(a.boundaryApproved).toBe(false);

    expect(b).toMatchObject({ positionSource: "CENTROID", lat: 6.6, lng: 100.6, boundary: null });

    const stored = await prisma.community.findUniqueOrThrow({ where: { id: withBoundary }, select: { centroidLat: true, centroidLng: true } });
    expect(Number(stored.centroidLat)).toBe(6.5);
    expect(Number(stored.centroidLng)).toBe(100.5);
  });

  it("4) payload สาธารณะ: whitelist ฟิลด์ (ไม่มี source/version/รายบ้าน) และทศนิยมไม่เกิน 5 ตำแหน่ง", async () => {
    const data = await getPublicMapData();
    expect(Object.keys(data).sort()).toEqual(["communities", "sites"]);
    for (const c of data.communities) {
      expect(Object.keys(c).sort()).toEqual(["boundary", "boundaryApproved", "id", "lat", "lng", "nameTh", "positionSource"]);
    }
    for (const s of data.sites) {
      expect(Object.keys(s).sort()).toEqual(["id", "lat", "lng", "name", "type"]);
    }
    const a = data.communities.find((c) => c.id === withBoundary)!;
    expect(a.boundary!.flat(2).flat().every((n) => Number(n.toFixed(5)) === n)).toBe(true);
  });
});
