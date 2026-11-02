import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { getPublicEmergencyContacts, getPublicMapData, getPublicStats } from "@/lib/public/stats";
import { listPublicExternalLinks } from "@/lib/external-links/core";
import { bangkokDate, getSongKhlongStations, getStationHistory } from "@/lib/water/thaiwater";
import { SongKhlongExperience } from "@/components/lab/song-khlong-experience";
import { SongKhlongHero } from "@/components/lab/song-khlong-hero";
import { FlagCriteria } from "@/components/lab/flag-criteria";
import { flagStatusFromReadings } from "@/lib/water/community-flag";
import {
  EmergencyContactsSection,
  ExternalLinksSection,
  JoinNetworkSection,
  PrepareTipsSection,
  PublicFooter,
  PublicStatsSection,
} from "@/components/public/home-sections";

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
  const mainId = feed.stations.at(-1)?.stationId ?? null;
  // ธงโดยประมาณ — เกณฑ์ของกลุ่มสองคลองควนลัง × ระดับน้ำสถานีที่สะพาน (ไม่ใช่ธงที่ประกาศ)
  const flagStatus = flagStatusFromReadings(feed.readings);
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
        estimatedFlag={flagStatus.flag}
      />
      {/* เบอร์ฉุกเฉิน — สำคัญสุดสำหรับประชาชน จึงอยู่ถัดจากส่วนหัวทันที */}
      <div className="bg-canvas px-4 py-10 md:px-10">
        <EmergencyContactsSection contacts={contacts} className="mx-auto max-w-[1200px]" />
      </div>
      <FlagCriteria bridges={flagStatus.bridges} flag={flagStatus.flag} measuredAt={flagStatus.measuredAt} />
      <div className="bg-canvas px-4 py-12 md:px-10">
        <div className="mx-auto max-w-[1200px]">
          <PublicStatsSection stats={stats} />
          <ExternalLinksSection links={externalLinks} className="mt-10" />
        </div>
      </div>
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
      <div className="bg-canvas px-4 py-12 md:px-10">
        <div className="mx-auto max-w-[1200px]">
          <PrepareTipsSection />
          <JoinNetworkSection className="mt-10" />
        </div>
      </div>
      <PublicFooter updatedAt={stats.generatedAt.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })} />
    </main>
  );
}
