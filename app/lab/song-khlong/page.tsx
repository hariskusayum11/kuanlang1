import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { getPublicMapData } from "@/lib/public/stats";
import { getSongKhlongStations } from "@/lib/water/thaiwater";
import { SongKhlongExperience } from "@/components/lab/song-khlong-experience";

export const metadata: Metadata = {
  title: "สองคลอง (ต้นแบบ)",
  // หน้าทดลอง — ยังไม่เปิดให้ค้นเจอจนกว่าจะตรวจเงื่อนไขข้อมูล ThaiWater และย้ายไปหน้าแรก
  robots: { index: false, follow: false },
};
// ระดับน้ำแคช 10 นาทีใน lib/water/thaiwater.ts · หน้าไม่ต้อง render ใหม่ทุกครั้ง
export const revalidate = 600;

/**
 * ต้นแบบ "สองคลอง" (คลองอู่ตะเภา + คลอง ร.1) แยกจากหน้าแรก — ถ้าดูดีและใช้งานได้ค่อยย้ายไปใส่
 * ข้อมูลทั้งหมดเป็นระดับสาธารณะ: เขตชุมชน · ช่องตารางน้ำท่วม ≥ 5 หลัง (ไม่มีพิกัดรายบ้าน) ·
 * จุดอพยพสาธารณะ · ระดับน้ำจากสถานีของรัฐ
 */
export default async function SongKhlongLabPage() {
  const [mapData, feed, canalsText] = await Promise.all([
    getPublicMapData(),
    getSongKhlongStations(),
    readFile(path.join(process.cwd(), "database/geo/song-khlong-canals.geojson"), "utf8"),
  ]);
  return (
    <SongKhlongExperience
      canals={JSON.parse(canalsText)}
      communities={mapData.communities.map((c) => ({ id: c.id, nameTh: c.nameTh, lat: c.lat, lng: c.lng, boundary: c.boundary }))}
      floodGrid={mapData.floodGrid.map((c) => ({ bounds: c.bounds, households: c.households, avgDepthCm: c.avgDepthCm }))}
      sites={mapData.sites}
      stations={feed.stations}
      feedError={feed.error}
    />
  );
}
