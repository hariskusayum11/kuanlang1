import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { getPublicEmergencyContacts, getPublicMapData, getPublicStats } from "@/lib/public/stats";
import { listPublicExternalLinks } from "@/lib/external-links/core";
import { bangkokDate, getSongKhlongStations, getStationHistory } from "@/lib/water/thaiwater";
import { SongKhlongExperience } from "@/components/lab/song-khlong-experience";
import { SongKhlongHero } from "@/components/lab/song-khlong-hero";
import { RiverPath } from "@/components/lab/river-path";
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
  // เวลาที่ยอดน้ำเดินทางระหว่างสถานีติดกัน (เหตุการณ์ พ.ย. 68) — คู่ที่ข้อมูลผิดปกติได้ null และไม่แสดง
  const upstreamFloods = await Promise.all(
    feed.stations.slice(0, -1).map((s) =>
      s.stationId ? getStationHistory(s.stationId, FLOOD_2568.start, FLOOD_2568.end, FLOOD_2568.cacheSeconds) : Promise.resolve([]),
    ),
  );
  const floodByCode = new Map(feed.stations.map((s, i) => [s.code, i === feed.stations.length - 1 ? flood : upstreamFloods[i] ?? []]));
  const lagHours = Object.fromEntries(
    feed.stations.slice(1).map((s, i) => {
      const up = feed.stations[i]!;
      return [`${up.code}>${s.code}`, peakLagHours(floodByCode.get(up.code) ?? [], floodByCode.get(s.code) ?? [])];
    }),
  );

  return (
    <main className="bg-canvas">
      <SongKhlongHero
        stations={feed.stations}
        recent={recent}
        flood={flood}
        communityNames={mapData.communities.slice(0, 5).map((c) => c.nameTh.replace(/^ชุมชน/, ""))}
        feedError={feed.error}
        flagStatus={flagStatus}
      />
      {/* เส้นทางน้ำต้นน้ำ → ควนลัง (ธงรายสะพาน + เวลาที่ยอดน้ำเดินทางจากเหตุการณ์ พ.ย. 68) */}
      <div className="bg-mist px-4 pb-8 md:px-10">
        <div className="mx-auto max-w-[1200px] pt-2">
          <RiverPath stations={feed.stations} bridges={flagStatus.bridges} lagHours={lagHours} communityCount={mapData.communities.length} />
        </div>
      </div>
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
