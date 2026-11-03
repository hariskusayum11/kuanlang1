import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { getPublicEmergencyContacts, getPublicMapData, getPublicStats } from "@/lib/public/stats";
import { listPublicExternalLinks } from "@/lib/external-links/core";
import { bangkokDate, getSongKhlongStations, getStationHistory } from "@/lib/water/thaiwater";
import { SongKhlongExperience } from "@/components/lab/song-khlong-experience";
import { SongKhlongHero, type StationHistory } from "@/components/lab/song-khlong-hero";
import { peakLagHours } from "@/domain/water/peak-lag";
import { FlagCriteria } from "@/components/lab/flag-criteria";
import { flagStatusFromReadings } from "@/lib/water/community-flag";
import { PublicFooter } from "@/components/public/home-sections";
import {
  CommunityNumbers,
  DataCredits,
  EmergencyStrip,
  JoinAndFollow,
  PrepareSteps,
  TrialSectionHeader,
} from "@/components/lab/home-trial-sections";

export const metadata: Metadata = {
  title: "สองคลอง (ต้นแบบ)",
  // หน้าทดลอง — ยังไม่เปิดให้ค้นเจอจนกว่าจะตรวจเงื่อนไขข้อมูล ThaiWater และย้ายไปหน้าแรก
  robots: { index: false, follow: false },
};
// Render ตอน request แบบหน้าแรก — หน้านี้อ่านฐานข้อมูล จึงต้องไม่ prerender ตอน build (Docker build ไม่มี DB)
// ระดับน้ำยังแคช 10 นาทีที่ระดับ fetch (lib/water/thaiwater.ts) ไม่ยิงต้นทางทุกครั้ง
export const dynamic = "force-dynamic";

/** ช่วงน้ำท่วมใหญ่ปลายปี 2568 (เวลาไทย) — ข้อมูลในอดีตไม่เปลี่ยน จึงแคชได้ 1 วัน */
const FLOOD_2568 = { start: "2025-11-18", end: "2025-12-02", cacheSeconds: 86_400 } as const;

/**
 * ต้นแบบ "สองคลอง" (คลองอู่ตะเภา + คลอง ร.1) แยกจากหน้าแรก — ถ้าดูดีและใช้งานได้ค่อยย้ายไปใส่
 * ทดลองรวมเนื้อหาหน้าแรกเดิมไว้ด้วย (เบอร์ฉุกเฉิน · ภาพรวมพื้นที่ · ลิงก์ภายนอก · เตรียมพร้อม · สมัครใช้งาน)
 * เพื่อดูว่าถ้าใช้หน้านี้เป็นหน้าหลักจะครบหรือไม่ — ส่วนเหล่านี้ใช้คอมโพเนนต์เดียวกับหน้าแรก
 * ข้อมูลทั้งหมดเป็นระดับสาธารณะ: ชื่อ/เขตชุมชน · ช่องตารางน้ำท่วม ≥ 5 หลัง (ไม่มีพิกัดรายบ้าน) ·
 * จุดอพยพสาธารณะ · ระดับน้ำจากสถานีของรัฐ
 */
export default async function SongKhlongLabPage() {
  const [mapData, feed, canalsText, stats, contacts, externalLinks] = await Promise.all([
    getPublicMapData(),
    getSongKhlongStations(),
    readFile(path.join(process.cwd(), "database/geo/song-khlong-canals.geojson"), "utf8"),
    getPublicStats(),
    getPublicEmergencyContacts(),
    listPublicExternalLinks(),
  ]);
  // ธงโดยประมาณ — เกณฑ์ของกลุ่มสองคลองควนลัง × ระดับน้ำสถานีที่สะพาน (ไม่ใช่ธงที่ประกาศ)
  const flagStatus = flagStatusFromReadings(feed.readings);
  // ระดับน้ำย้อนหลังของทุกจุดวัด (ภาพส่วนหัวเลือกดูได้ทีละจุด) — 3 วันล่าสุดแคช 10 นาที · พ.ย. 68 แคช 1 วัน
  const now = new Date();
  const histories: Record<string, StationHistory> = Object.fromEntries(
    await Promise.all(
      feed.readings.map(async (r) => {
        if (!r.stationId) return [r.code, { recent: [], flood: [] }] as const;
        const [recent, flood] = await Promise.all([
          getStationHistory(r.stationId, bangkokDate(new Date(now.getTime() - 3 * 86_400_000)), bangkokDate(now)),
          getStationHistory(r.stationId, FLOOD_2568.start, FLOOD_2568.end, FLOOD_2568.cacheSeconds),
        ]);
        return [r.code, { recent, flood }] as const;
      }),
    ),
  );
  // เวลาที่ยอดน้ำเดินทางระหว่างสถานีติดกัน (เหตุการณ์ พ.ย. 68) — คู่ที่ข้อมูลผิดปกติได้ null และไม่แสดง
  const lagHours = Object.fromEntries(
    feed.stations.slice(1).map((s, i) => {
      const up = feed.stations[i]!;
      return [`${up.code}>${s.code}`, peakLagHours(histories[up.code]?.flood ?? [], histories[s.code]?.flood ?? [])];
    }),
  );

  return (
    <main className="bg-canvas">
      <SongKhlongHero
        stations={feed.stations}
        readings={feed.readings}
        histories={histories}
        communityNames={mapData.communities.slice(0, 5).map((c) => c.nameTh.replace(/^ชุมชน/, ""))}
        feedError={feed.error}
        flagStatus={flagStatus}
        lagHours={lagHours}
      />
      {/* เบอร์ฉุกเฉิน — สำคัญสุดสำหรับประชาชน จึงอยู่ถัดจากส่วนหัวทันที */}
      <EmergencyStrip contacts={contacts} />
      <FlagCriteria bridges={flagStatus.bridges} measuredAt={flagStatus.measuredAt} />
      <section id="map" aria-labelledby="map-title" className="bg-canvas px-4 py-16 md:px-10 md:py-20">
        <div className="mx-auto max-w-[1200px]">
          <TrialSectionHeader
            id="map-title"
            eyebrow="5 ชุมชนริมสองคลอง"
            title="น้ำไหลผ่านชุมชนอย่างไร"
            lead="คลองอู่ตะเภาไหลจากใต้ขึ้นเหนือผ่านหาดใหญ่ใน เมื่อน้ำมาก น้ำก้อนใหญ่ถูกผันเข้าคลอง ร.1 ไปทางควนลัง — แผนที่แสดงเขตชุมชนและพื้นที่ที่ชาวบ้านเคยเจอน้ำท่วม เป็นภาพรวมระดับพื้นที่ ไม่มีตำแหน่งรายบ้าน"
          />
          <CommunityNumbers stats={stats} />
          <div className="mt-6">
            <SongKhlongExperience
              canals={JSON.parse(canalsText)}
              communities={mapData.communities.map((c) => ({ id: c.id, nameTh: c.nameTh, lat: c.lat, lng: c.lng, boundary: c.boundary }))}
              floodGrid={mapData.floodGrid.map((c) => ({ bounds: c.bounds, households: c.households, avgDepthCm: c.avgDepthCm }))}
              sites={mapData.sites}
              stations={feed.stations}
              markerStations={feed.readings}
              bridges={flagStatus.bridges}
            />
          </div>
        </div>
      </section>
      <PrepareSteps />
      <JoinAndFollow links={externalLinks} />
      <DataCredits />
      <PublicFooter updatedAt={stats.generatedAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} />
    </main>
  );
}
