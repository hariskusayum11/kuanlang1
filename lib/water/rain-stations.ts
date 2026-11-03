// สถานีวัดฝนรอบควนลัง (คลังข้อมูลน้ำแห่งชาติ · ThaiWater) — หน้าต้นแบบ /lab/song-khlong
// ข้อมูลรวมจากหลายหน่วยงาน (กรมชลประทาน · กรมทรัพยากรน้ำ · สสน. · กรมอุตุนิยมวิทยา) — ระบุหน่วยงานเจ้าของทุกจุด
// ดึงที่ server แคช 10 นาที · ล้มเหลว = รายการว่าง
const ENDPOINT = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h";

export interface RainStation {
  code: string;
  name: string;
  lat: number;
  lng: number;
  /** ฝนสะสม 24 ชม. (มม.) */
  rain24h: number | null;
  /** ฝน 1 ชม. ล่าสุด (มม.) — บางหน่วยงานไม่ส่งค่านี้ */
  rain1h: number | null;
  /** เวลาไทย "YYYY-MM-DD HH:mm" */
  measuredAt: string | null;
  /** หน่วยงานเจ้าของสถานี (ชื่อเต็ม) */
  agency: string;
  distanceKm: number;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}

/** คัดสถานีในรัศมี เรียงใกล้ → ไกล · ข้ามสถานีไม่มีพิกัด */
export function parseRainStations(payload: unknown, center: { lat: number; lng: number }, radiusKm: number): RainStation[] {
  const data = (payload as { data?: unknown[] })?.data;
  if (!Array.isArray(data)) return [];
  return data
    .flatMap((raw) => {
      const r = raw as {
        rain_24h?: unknown;
        rain_1h?: unknown;
        rainfall_datetime?: unknown;
        agency?: { agency_name?: { th?: string } | null; agency_shortname?: { th?: string } | null } | null;
        station?: { tele_station_oldcode?: unknown; tele_station_name?: { th?: string } | null; tele_station_lat?: unknown; tele_station_long?: unknown } | null;
      };
      const lat = num(r.station?.tele_station_lat);
      const lng = num(r.station?.tele_station_long);
      if (lat === null || lng === null) return [];
      const d = distanceKm(center, { lat, lng });
      if (d > radiusKm) return [];
      return [
        {
          code: String(r.station?.tele_station_oldcode ?? ""),
          name: r.station?.tele_station_name?.th ?? "สถานีวัดฝน",
          lat,
          lng,
          rain24h: num(r.rain_24h),
          rain1h: num(r.rain_1h),
          measuredAt: typeof r.rainfall_datetime === "string" ? r.rainfall_datetime : null,
          agency: (r.agency?.agency_name?.th ?? r.agency?.agency_shortname?.th ?? "").trim() || "ไม่ระบุหน่วยงาน",
          distanceKm: d,
        },
      ];
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export async function getRainStations(center = { lat: 6.99, lng: 100.465 }, radiusKm = 12): Promise<RainStation[]> {
  try {
    const res = await fetch(ENDPOINT, {
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(20_000),
      headers: { "User-Agent": "SKL-FRIS/lab (khuanlangmodel.com)", Accept: "application/json" },
    });
    return res.ok ? parseRainStations(await res.json(), center, radiusKm) : [];
  } catch {
    return [];
  }
}
