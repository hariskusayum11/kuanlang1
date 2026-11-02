import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { getPublicMapData } from "@/lib/public/stats";
import { bangkokDate, getSongKhlongStations, getStationHistory } from "@/lib/water/thaiwater";
import { SongKhlongExperience } from "@/components/lab/song-khlong-experience";
import { SongKhlongHero } from "@/components/lab/song-khlong-hero";
import { FlagCriteria } from "@/components/lab/flag-criteria";

export const metadata: Metadata = {
  title: "สองคลอง (ต้นแบบ)",
  // หน้าทดลอง — ยังไม่เปิดให้ค้นเจอจนกว่าจะตรวจเงื่อนไขข้อมูล ThaiWater และย้ายไปหน้าแรก
  robots: { index: false, follow: false },
};
// ระดับน้ำแคช 10 นาทีใน lib/water/thaiwater.ts · หน้าไม่ต้อง render ใหม่ทุกครั้ง
export const revalidate = 600;

/** ช่วงน้ำท่วมใหญ่ปลายปี 2568 (เวลาไทย) — ข้อมูลในอดีตไม่เปลี่ยน จึงแคชได้ 1 วัน */
const FLOOD_2568 = { start: "2025-11-18", end: "2025-12-02", cacheSeconds: 86_400 } as const;

/**
 * ต้นแบบ "สองคลอง" (คลองอู่ตะเภา + คลอง ร.1) แยกจากหน้าแรก — ถ้าดูดีและใช้งานได้ค่อยย้ายไปใส่
 * ข้อมูลทั้งหมดเป็นระดับสาธารณะ: ชื่อ/เขตชุมชน · ช่องตารางน้ำท่วม ≥ 5 หลัง (ไม่มีพิกัดรายบ้าน) ·
 * จุดอพยพสาธารณะ · ระดับน้ำจากสถานีของรัฐ
 */
export default async function SongKhlongLabPage() {
  const [mapData, feed, canalsText] = await Promise.all([
    getPublicMapData(),
    getSongKhlongStations(),
    readFile(path.join(process.cwd(), "database/geo/song-khlong-canals.geojson"), "utf8"),
  ]);
  const mainId = feed.stations.at(-1)?.stationId ?? null;
  const now = new Date();
  const [recent, flood] = mainId
    ? await Promise.all([
        getStationHistory(mainId, bangkokDate(new Date(now.getTime() - 3 * 86_400_000)), bangkokDate(now)),
        getStationHistory(mainId, FLOOD_2568.start, FLOOD_2568.end, FLOOD_2568.cacheSeconds),
      ])
    : [[], []];

  return (
    <main className="bg-ink-900">
      <SongKhlongHero
        stations={feed.stations}
        recent={recent}
        flood={flood}
        communityNames={mapData.communities.slice(0, 5).map((c) => c.nameTh.replace(/^ชุมชน/, ""))}
        feedError={feed.error}
      />
      <FlagCriteria />
      <section id="map" aria-label="แผนที่สองคลอง">
        <SongKhlongExperience
          canals={JSON.parse(canalsText)}
          communities={mapData.communities.map((c) => ({ id: c.id, nameTh: c.nameTh, lat: c.lat, lng: c.lng, boundary: c.boundary }))}
          floodGrid={mapData.floodGrid.map((c) => ({ bounds: c.bounds, households: c.households, avgDepthCm: c.avgDepthCm }))}
          sites={mapData.sites}
          stations={feed.stations}
          feedError={feed.error}
        />
      </section>
    </main>
  );
}
