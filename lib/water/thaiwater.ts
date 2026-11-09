// ระดับน้ำเรียลไทม์จากคลังข้อมูลน้ำแห่งชาติ (ThaiWater · สสน./กรมชลประทาน)
// -----------------------------------------------------------------------------
// หน้าแรก (docs/44) — ดึงที่ server แล้วแคช 2 นาที (ต้นทางไม่เปิด CORS และ
// ไม่ควรให้ผู้เข้าชมทุกคนยิงไปที่ต้นทางเอง) · ล้มเหลว = คืนรายการว่าง หน้ายังแสดงได้
// การใช้ข้อมูล: ผู้บริหารยื่นขออนุญาต สสน. แล้ว (Owner Decision 2026-11-09) — คงเครดิตทุกจุดที่แสดงค่า
import type { HistoryPoint, StationReading } from "../../domain/water/station-status";

const ENDPOINT = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load";
const GRAPH_ENDPOINT = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_graph";
const HEADERS = { "User-Agent": "SKL-FRIS/lab (khuanlangmodel.com)", Accept: "application/json" };
// ค่าสดแคชสั้น 2 นาที (เดิม 10 นาที) — สถานีกรมชลประทานส่งค่ารายชั่วโมง แคชสั้นทำให้เห็นค่าชั่วโมงใหม่เร็วขึ้น
// โดยยังไม่ยิงต้นทางทุกครั้งที่มีคนเปิดหน้า (server ดึงอย่างมาก 1 ครั้ง/2 นาที/endpoint)
const CACHE_SECONDS = 120;

/** สถานีบนคลองอู่ตะเภา เรียงจากต้นน้ำ → ควนลัง (น้ำไหลจากใต้ขึ้นเหนือ) */
export const SONG_KHLONG_STATIONS = ["X.173A", "X.90", "X.44"] as const;
/** สถานีที่ใช้เฉพาะธงโดยประมาณ (สะพานบ้านคลองหวะ — คลองหวะไหลลงคลองอู่ตะเภา) */
export const FLAG_ONLY_STATIONS = ["X.174"] as const;
/**
 * สถานีของ สสน. ที่ส่งค่าทุก 10 นาที ตั้งอยู่จุดเดียวกับสถานีกรมชลประทาน (docs/44 §5) — ข้อมูลเสริม
 * ใช้ดูน้ำขึ้น/ลงระหว่างชั่วโมงเท่านั้น **ไม่ใช้ตัดสินธง** และไม่ปักหมุดแยก (ซ้อนกับหมุดสะพาน)
 * ตรวจจริง 2026-11-09: SLA002 คลองหอยโข่ง อยู่พิกัดเดียวกับ X.90 บางศาลา · ค่าต่ำกว่า X.90 คงที่ ~0.15 ม.
 * (35 ชม. ส่วนเบี่ยงเบน 0.01 ม.) · SLA001 หาดใหญ่ ไม่มีในข้อมูลสาธารณะของ ThaiWater ขณะตรวจ
 */
export const TEN_MINUTE_STATIONS = [{ code: "SLA002", pairedWith: "X.90" }] as const;

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
  /** สถานี สสน. ส่งค่าทุก 10 นาที (TEN_MINUTE_STATIONS) — แยกจาก readings เพื่อไม่ให้เข้าการคำนวณธง */
  tenMinute: StationReading[];
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
    if (!res.ok) return { stations: [], readings: [], tenMinute: [], fetchedAt: null, error: `ThaiWater ตอบกลับ ${res.status}` };
    const payload: unknown = await res.json();
    const readings = parseThaiWater(payload, [...new Set([...SONG_KHLONG_STATIONS, ...FLAG_ONLY_STATIONS, ...extraCodes])]);
    const stations = readings.filter((r) => (SONG_KHLONG_STATIONS as readonly string[]).includes(r.code));
    const tenMinute = parseThaiWater(payload, TEN_MINUTE_STATIONS.map((s) => s.code));
    return { stations, readings, tenMinute, fetchedAt: new Date().toISOString(), error: stations.length ? null : "ไม่พบสถานีที่ต้องการในข้อมูล" };
  } catch {
    return { stations: [], readings: [], tenMinute: [], fetchedAt: null, error: "เชื่อมต่อคลังข้อมูลน้ำแห่งชาติไม่ได้" };
  }
}

/**
 * ใช้ค่ารายชั่วโมงล่าสุดจากกราฟ เมื่อใหม่กว่าค่าใน waterlevel_load
 * (ตรวจจริง 2026-11-09: waterlevel_load ยังเป็น 13:00 ขณะที่ waterlevel_graph มีค่า 14:00 แล้ว และค่าชั่วโมงเดียวกันตรงกัน)
 * ค่าก่อนหน้า = จุดก่อนหน้าในกราฟ (แนวโน้มขึ้น/ลงจึงเทียบกับชั่วโมงก่อนเสมอ)
 */
export function freshenReadings<T extends StationReading>(readings: readonly T[], recentByCode: Readonly<Record<string, readonly HistoryPoint[]>>): T[] {
  return readings.map((r) => {
    const pts = recentByCode[r.code] ?? [];
    const last = pts.at(-1);
    // เวลาไทย "YYYY-MM-DD HH:mm" — เทียบเป็นข้อความได้
    if (!last || (r.measuredAt !== null && last.at <= r.measuredAt)) return r;
    const prev = pts.at(-2);
    return { ...r, levelMsl: last.levelMsl, previousMsl: prev ? prev.levelMsl : r.levelMsl, measuredAt: last.at };
  });
}

/** ข้อมูลจาก waterlevel_graph (รายชั่วโมง · สถานี สสน. ทุก 10 นาที) — ข้ามจุดที่ไม่มีค่า */
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

/** เวลาไทย "YYYY-MM-DD HH:mm" — รูปแบบเดียวกับเวลาของต้นทาง */
export function bangkokStamp(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
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
