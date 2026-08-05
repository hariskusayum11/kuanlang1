// นำเข้าขอบเขตชุมชนจากไฟล์ GeoJSON → community_boundary (PostGIS)
// ---------------------------------------------------------------------------
// ใช้ได้ทั้งไฟล์ "ร่างโดยประมาณ" และ "ไฟล์ GIS จริงจากเทศบาล"
//
//   npx tsx scripts/import-boundaries.ts <file.geojson> [--source "ที่มา"] [--approved]
//
// รูปแบบไฟล์: FeatureCollection ที่แต่ละ Feature มี properties.code = รหัสชุมชน
//   (เช่น "TK01") และ geometry เป็น Polygon หรือ MultiPolygon (SRID 4326 / lng,lat)
//
// พฤติกรรม (idempotent-ish): ปิดขอบเขตปัจจุบันของชุมชนนั้น (effectiveTo=now)
// แล้วเพิ่มเวอร์ชันใหม่เป็นขอบเขตปัจจุบัน — เก็บประวัติเดิมไว้ ไม่ทำลาย
// geom เป็น Unsupported ใน Prisma จึงเขียนผ่าน raw SQL (ST_GeomFromGeoJSON + ST_Multi)

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

interface Feature {
  type: "Feature";
  properties?: Record<string, unknown> | null;
  geometry: unknown;
}
interface FeatureCollection {
  type: "FeatureCollection";
  features: Feature[];
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("ใช้: npx tsx scripts/import-boundaries.ts <file.geojson> [--source \"...\"] [--approved]");
    process.exit(1);
  }
  const source = arg("--source") ?? "นำเข้าจากไฟล์ GeoJSON";
  const approved = process.argv.includes("--approved");

  const fc = JSON.parse(readFileSync(file, "utf8")) as FeatureCollection;
  if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) {
    throw new Error("ไฟล์ต้องเป็น GeoJSON FeatureCollection");
  }

  let imported = 0;
  const skipped: string[] = [];

  for (const f of fc.features) {
    const code = String(f.properties?.code ?? "").trim();
    if (!code) {
      skipped.push("(ไม่มี properties.code)");
      continue;
    }
    const community = await prisma.community.findUnique({ where: { code }, select: { id: true } });
    if (!community) {
      skipped.push(`${code} (ไม่พบชุมชน)`);
      continue;
    }
    const geojson = JSON.stringify(f.geometry);
    const id = randomUUID();

    await prisma.$transaction(async (tx) => {
      // ปิดขอบเขตปัจจุบันของชุมชนนี้
      await tx.$executeRaw(Prisma.sql`
        UPDATE community_boundary
        SET "effectiveTo" = now()
        WHERE "communityId" = ${community.id} AND "effectiveTo" IS NULL
      `);
      // เวอร์ชันถัดไป
      const rows = await tx.$queryRaw<{ next: number }[]>(Prisma.sql`
        SELECT COALESCE(MAX(version), 0) + 1 AS next
        FROM community_boundary WHERE "communityId" = ${community.id}
      `);
      const nextVersion = rows[0]?.next ?? 1;
      // เพิ่มขอบเขตใหม่ (Polygon → MultiPolygon, geography 4326)
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO community_boundary
          ("id", "communityId", "version", "geom", "source", "isApproved", "effectiveFrom", "createdAt")
        VALUES (
          ${id}, ${community.id}, ${nextVersion},
          ST_Multi(ST_GeomFromGeoJSON(${geojson}))::geography,
          ${source}, ${approved}, now(), now()
        )
      `);
    });

    imported += 1;
    console.log(`  ✓ ${code} → v${"?"} (${approved ? "รับรอง" : "ร่าง"})`);
  }

  console.log(`\nนำเข้า ${imported} ขอบเขต · ข้าม ${skipped.length}${skipped.length ? " → " + skipped.join(", ") : ""}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("ล้มเหลว:", e instanceof Error ? e.message : e);
  process.exit(1);
});
