// ระดับน้ำเรียลไทม์จากคลังข้อมูลน้ำแห่งชาติ (ThaiWater · สสน./กรมชลประทาน)
// -----------------------------------------------------------------------------
// ต้นแบบหน้า /lab/song-khlong — ดึงที่ server แล้วแคช 10 นาที (ต้นทางไม่เปิด CORS และ
// ไม่ควรให้ผู้เข้าชมทุกคนยิงไปที่ต้นทางเอง) · ล้มเหลว = คืนรายการว่าง หน้ายังแสดงได้
// ⚠️ ยังไม่ได้ตรวจเงื่อนไขการใช้ข้อมูลของ ThaiWater — ต้องตรวจและใส่เครดิตก่อนเผยแพร่จริง
import type { StationReading } from "../../domain/water/station-status";

const ENDPOINT = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load";
const CACHE_SECONDS = 600;

/** สถานีบนคลองอู่ตะเภา เรียงจากต้นน้ำ → ควนลัง (น้ำไหลจากใต้ขึ้นเหนือ) */
export const SONG_KHLONG_STATIONS = ["X.173A", "X.90", "X.44"] as const;

interface RawRecord {
  waterlevel_datetime?: string | null;
  waterlevel_msl?: string | number | null;
  waterlevel_msl_previous?: string | number | null;
  river_name?: string | null;
  agency?: { agency_shortname?: { th?: string } | null } | null;
  station?: {
    tele_station_oldcode?: string | null;
    tele_station_name?: { th?: string } | null;
    tele_station_lat?: number | null;
    tele_station_long?: number | null;
    min_bank?: number | string | null;
    ground_level?: number | string | null;
  } | null;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function parseThaiWater(payload: unknown, codes: readonly string[]): StationReading[] {
  const data = (payload as { waterlevel_data?: { data?: RawRecord[] } })?.waterlevel_data?.data;
  if (!Array.isArray(data)) return [];
  const byCode = new Map<string, StationReading>();
  for (const r of data) {
    const code = r.station?.tele_station_oldcode ?? "";
    if (!codes.includes(code)) continue;
    const lat = num(r.station?.tele_station_lat);
    const lng = num(r.station?.tele_station_long);
    if (lat === null || lng === null) continue;
    byCode.set(code, {
      code,
      name: r.station?.tele_station_name?.th ?? code,
      river: r.river_name ?? "",
      lat,
      lng,
      levelMsl: num(r.waterlevel_msl),
      previousMsl: num(r.waterlevel_msl_previous),
      bankMsl: num(r.station?.min_bank),
      groundMsl: num(r.station?.ground_level),
      measuredAt: r.waterlevel_datetime ?? null,
      agency: r.agency?.agency_shortname?.th ?? null,
    });
  }
  return codes.flatMap((c) => (byCode.has(c) ? [byCode.get(c)!] : []));
}

export interface StationFeed {
  stations: StationReading[];
  /** เวลาที่ server ดึงข้อมูล (ISO) · null = ดึงไม่สำเร็จ */
  fetchedAt: string | null;
  error: string | null;
}

export async function getSongKhlongStations(): Promise<StationFeed> {
  try {
    const res = await fetch(ENDPOINT, {
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(15_000),
      headers: { "User-Agent": "SKL-FRIS/lab (khuanlangmodel.com)", Accept: "application/json" },
    });
    if (!res.ok) return { stations: [], fetchedAt: null, error: `ThaiWater ตอบกลับ ${res.status}` };
    const stations = parseThaiWater(await res.json(), SONG_KHLONG_STATIONS);
    return { stations, fetchedAt: new Date().toISOString(), error: stations.length ? null : "ไม่พบสถานีที่ต้องการในข้อมูล" };
  } catch {
    return { stations: [], fetchedAt: null, error: "เชื่อมต่อคลังข้อมูลน้ำแห่งชาติไม่ได้" };
  }
}
