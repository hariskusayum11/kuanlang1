// ระดับน้ำเรียลไทม์จากคลังข้อมูลน้ำแห่งชาติ (ThaiWater · สสน./กรมชลประทาน)
// -----------------------------------------------------------------------------
// ต้นแบบหน้า /lab/song-khlong — ดึงที่ server แล้วแคช 10 นาที (ต้นทางไม่เปิด CORS และ
// ไม่ควรให้ผู้เข้าชมทุกคนยิงไปที่ต้นทางเอง) · ล้มเหลว = คืนรายการว่าง หน้ายังแสดงได้
// ⚠️ ยังไม่ได้ตรวจเงื่อนไขการใช้ข้อมูลของ ThaiWater — ต้องตรวจและใส่เครดิตก่อนเผยแพร่จริง
import type { HistoryPoint, StationReading } from "../../domain/water/station-status";

const ENDPOINT = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load";
const GRAPH_ENDPOINT = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_graph";
const HEADERS = { "User-Agent": "SKL-FRIS/lab (khuanlangmodel.com)", Accept: "application/json" };
const CACHE_SECONDS = 600;

/** สถานีบนคลองอู่ตะเภา เรียงจากต้นน้ำ → ควนลัง (น้ำไหลจากใต้ขึ้นเหนือ) */
export const SONG_KHLONG_STATIONS = ["X.173A", "X.90", "X.44"] as const;
/** สถานีที่ใช้เฉพาะธงโดยประมาณ (สะพานบ้านคลองหวะ — คลองหวะไหลลงคลองอู่ตะเภา) */
export const FLAG_ONLY_STATIONS = ["X.174"] as const;

interface RawRecord {
  waterlevel_datetime?: string | null;
  waterlevel_msl?: string | number | null;
  waterlevel_msl_previous?: string | number | null;
  river_name?: string | null;
  agency?: { agency_shortname?: { th?: string } | null } | null;
  station?: {
    id?: number | null;
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
      stationId: num(r.station?.id),
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
  /** สถานีบนคลองอู่ตะเภา เรียงต้นน้ำ → ควนลัง */
  stations: StationReading[];
  /** ทุกสถานีที่ดึงมา (รวมคลองหวะ) — ใช้คำนวณธงโดยประมาณ */
  readings: StationReading[];
  /** เวลาที่ server ดึงข้อมูล (ISO) · null = ดึงไม่สำเร็จ */
  fetchedAt: string | null;
  error: string | null;
}

/** `extraCodes` = สถานีของสะพานในเกณฑ์ธง (แก้ได้ในระบบ — สะพานที่เพิ่มใหม่ต้องดึงด้วย) */
export async function getSongKhlongStations(extraCodes: readonly string[] = []): Promise<StationFeed> {
  try {
    const res = await fetch(ENDPOINT, {
      next: { revalidate: CACHE_SECONDS },
      signal: AbortSignal.timeout(15_000),
      headers: HEADERS,
    });
    if (!res.ok) return { stations: [], readings: [], fetchedAt: null, error: `ThaiWater ตอบกลับ ${res.status}` };
    const readings = parseThaiWater(await res.json(), [...new Set([...SONG_KHLONG_STATIONS, ...FLAG_ONLY_STATIONS, ...extraCodes])]);
    const stations = readings.filter((r) => (SONG_KHLONG_STATIONS as readonly string[]).includes(r.code));
    return { stations, readings, fetchedAt: new Date().toISOString(), error: stations.length ? null : "ไม่พบสถานีที่ต้องการในข้อมูล" };
  } catch {
    return { stations: [], readings: [], fetchedAt: null, error: "เชื่อมต่อคลังข้อมูลน้ำแห่งชาติไม่ได้" };
  }
}

/** ข้อมูลรายชั่วโมงจาก waterlevel_graph — ข้ามชั่วโมงที่ไม่มีค่า */
export function parseGraph(payload: unknown): HistoryPoint[] {
  const data = (payload as { data?: { graph_data?: Array<{ datetime?: string; value?: unknown }> } })?.data?.graph_data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((d) => {
    const level = num(d.value);
    return typeof d.datetime === "string" && level !== null ? [{ at: d.datetime, levelMsl: level }] : [];
  });
}

/** วันที่ตามเวลาไทย "YYYY-MM-DD" (ต้นทางใช้เวลาไทย) */
export function bangkokDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * ระดับน้ำรายชั่วโมงของสถานีระหว่างวันที่ (รวมปลายทั้งสองวัน)
 * `cacheSeconds` — ช่วงล่าสุดใช้ 10 นาที · เหตุการณ์ในอดีต (ข้อมูลไม่เปลี่ยน) แคชได้นาน
 */
export async function getStationHistory(stationId: number, startDate: string, endDate: string, cacheSeconds = CACHE_SECONDS): Promise<HistoryPoint[]> {
  const url = `${GRAPH_ENDPOINT}?station_type=tele_waterlevel&station_id=${stationId}&start_date=${startDate}&end_date=${endDate}`;
  try {
    const res = await fetch(url, { next: { revalidate: cacheSeconds }, signal: AbortSignal.timeout(15_000), headers: HEADERS });
    return res.ok ? parseGraph(await res.json()) : [];
  } catch {
    return [];
  }
}
