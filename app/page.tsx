import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import { getPublicEmergencyContacts, getPublicMapData, getPublicStats } from "@/lib/public/stats";
import { listPublicExternalLinks } from "@/lib/external-links/core";
import { bangkokDate, freshenReadings, getSongKhlongStations, getStationHistory } from "@/lib/water/thaiwater";
import { AutoRefresh } from "@/components/ui/auto-refresh";
import { SongKhlongExperience } from "@/components/lab/song-khlong-experience";
import { SongKhlongHero, type StationHistory } from "@/components/lab/song-khlong-hero";
import { peakLagHours } from "@/domain/water/peak-lag";
import { getHatYaiWeather, getRainForecast, getRainHistory } from "@/lib/water/weather";
import { getRainStations } from "@/lib/water/rain-stations";
import type { DayPhase, RainLevel } from "@/domain/water/sky";

import { FlagCriteria } from "@/components/lab/flag-criteria";
import { flagStatusFromReadings } from "@/lib/water/community-flag";
import { getActiveFlagCriteria } from "@/lib/water/flag-criteria";
import { PublicFooter } from "@/components/public/home-sections";
import {
  CommunityNumbers,
  DataCredits,
  EmergencyStrip,
  JoinAndFollow,
  PrepareSteps,
  TrialSectionHeader,
} from "@/components/lab/home-trial-sections";

const PHASES: readonly DayPhase[] = ["dawn", "day", "dusk", "night"];
const RAINS: readonly RainLevel[] = ["none", "light", "moderate", "heavy"];

export const metadata: Metadata = {
  title: "สองคลองควนลัง — ระดับน้ำและธงเตือนภัยชุมชน",
  description: "ระดับน้ำคลองอู่ตะเภาและคลองหวะ ธงเตือนภัยโดยประมาณของ 5 ชุมชนตำบลควนลัง อากาศ และเบอร์ฉุกเฉิน",
};
// Render ตอน request — หน้านี้อ่านฐานข้อมูล จึงต้องไม่ prerender ตอน build (Docker build ไม่มี DB)
// ระดับน้ำยังแคช 10 นาทีที่ระดับ fetch (lib/water/thaiwater.ts) ไม่ยิงต้นทางทุกครั้ง
export const dynamic = "force-dynamic";

/** ช่วงน้ำท่วมใหญ่ปลายปี 2568 (เวลาไทย) — ข้อมูลในอดีตไม่เปลี่ยน จึงแคชได้ 1 วัน */
const FLOOD_2568 = { start: "2025-11-18", end: "2025-12-02", cacheSeconds: 86_400 } as const;

/**
 * หน้าแรกสาธารณะ "สองคลอง" (Owner Decision 2026-11-09 · docs/44) — แทนหน้าแรกเดิม เปิดได้โดยไม่ login
 * ธงเตือนภัยโดยประมาณ (เกณฑ์แก้ได้ที่ /flag-criteria) · ระดับน้ำ ThaiWater · อากาศ · เบอร์ฉุกเฉิน · แผนที่ความรุนแรงน้ำท่วม
 * ข้อมูลทั้งหมดเป็นระดับสาธารณะ: ชื่อ/เขตชุมชน · ช่องตารางน้ำท่วม ≥ 5 หลัง (ไม่มีพิกัดรายบ้าน) ·
 * จุดอพยพสาธารณะ · ระดับน้ำจากสถานีของรัฐ
 */
export default async function PublicHomePage({ searchParams }: { searchParams: Promise<{ sky?: string; rain?: string }> }) {
  // ?sky=night / ?rain=heavy — พรีวิวภาพตามเวลา/อากาศ (รับเฉพาะค่าที่รู้จัก)
  const sp = await searchParams;
  const forcePhase = PHASES.find((p) => p === sp.sky);
  const forceRain = RAINS.find((r) => r === sp.rain);
  // เกณฑ์ธงก่อน — สะพานที่ ADMIN เพิ่มเข้ามาต้องดึงระดับน้ำของสถานีนั้นด้วย
  const criteria = await getActiveFlagCriteria();
  const [mapData, feed, canalsText, stats, contacts, externalLinks] = await Promise.all([
    getPublicMapData(),
    getSongKhlongStations(criteria.config.bridges.map((b) => b.stationCode)),
    readFile(path.join(process.cwd(), "database/geo/song-khlong-canals.geojson"), "utf8"),
    getPublicStats(),
    getPublicEmergencyContacts(),
    listPublicExternalLinks(),
  ]);
  // อากาศตอนนี้ + ฝนรายชั่วโมงย้อนหลัง (3 วัน และช่วงน้ำท่วม พ.ย. 68) — ใช้แต่งท้องฟ้าของภาพตอนย้อนดู
  const [weather, recentRain, floodRain, forecast, rainStations] = await Promise.all([
    getHatYaiWeather(),
    getRainHistory({ recentDays: 3 }),
    getRainHistory({ start: FLOOD_2568.start, end: FLOOD_2568.end }),
    getRainForecast(),
    getRainStations(),
  ]);
  // ระดับน้ำย้อนหลังของทุกจุดวัด (ภาพส่วนหัวเลือกดูได้ทีละจุด) — 3 วันล่าสุดแคช 2 นาที · พ.ย. 68 แคช 1 วัน
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
  // ค่าชั่วโมงล่าสุดจากกราฟมักมาก่อนรายการ "ล่าสุด" ของ ThaiWater ราว 30 นาที — ใช้ค่าที่ใหม่กว่า
  const recentByCode = Object.fromEntries(Object.entries(histories).map(([code, h]) => [code, h.recent]));
  const readings = freshenReadings(feed.readings, recentByCode);
  const stations = freshenReadings(feed.stations, recentByCode);
  // ธงโดยประมาณ — เกณฑ์ของกลุ่มสองคลองควนลัง × ระดับน้ำสถานีที่สะพาน (ไม่ใช่ธงที่ประกาศ)
  const flagStatus = flagStatusFromReadings(criteria.config, readings, criteria.versionNo);
  // เวลาที่ยอดน้ำเดินทางระหว่างสถานีติดกัน (เหตุการณ์ พ.ย. 68) — คู่ที่ข้อมูลผิดปกติได้ null และไม่แสดง
  const lagHours = Object.fromEntries(
    feed.stations.slice(1).map((s, i) => {
      const up = feed.stations[i]!;
      return [`${up.code}>${s.code}`, peakLagHours(histories[up.code]?.flood ?? [], histories[s.code]?.flood ?? [])];
    }),
  );

  return (
    <main className="bg-canvas">
      {/* หน้าเปิดค้างไว้ก็ได้ค่าใหม่เอง — ดึงข้อมูลจาก server ใหม่ทุก 2 นาทีขณะเปิดดูอยู่ */}
      <AutoRefresh intervalMs={120_000} />
      <SongKhlongHero
        stations={stations}
        readings={readings}
        histories={histories}
        communityNames={mapData.communities.slice(0, 5).map((c) => c.nameTh.replace(/^ชุมชน/, ""))}
        feedError={feed.error}
        flagStatus={flagStatus}
        lagHours={lagHours}
        weather={weather}
        rainHistory={{ recent: recentRain, flood: floodRain }}
        forecast={forecast}
        forcePhase={forcePhase}
        forceRain={forceRain}
      />
      {/* เบอร์ฉุกเฉิน — สำคัญสุดสำหรับประชาชน จึงอยู่ถัดจากส่วนหัวทันที */}
      <EmergencyStrip contacts={contacts} />
      <FlagCriteria status={flagStatus} />
      <section id="map" aria-labelledby="map-title" className="bg-canvas px-4 py-10 md:px-10 md:py-14">
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
              floodGrid={mapData.floodGrid}
              sites={mapData.sites}
              stations={stations}
              markerStations={readings}
              bridges={flagStatus.bridges}
              rainStations={rainStations}
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
