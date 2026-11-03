// สภาพอากาศปัจจุบันที่หาดใหญ่ (Open-Meteo · CC BY 4.0) — ใช้แต่งภาพส่วนหัว /lab/song-khlong เท่านั้น
// ดึงที่ server แคช 10 นาที · ล้มเหลว = null (ภาพแสดงตามเวลาอย่างเดียว ไม่วาดฝน) · ไม่ใช่ข้อมูลเตือนภัย
const ENDPOINT =
  "https://api.open-meteo.com/v1/forecast?latitude=7.0&longitude=100.46&current=precipitation,cloud_cover,weather_code,is_day&timezone=Asia%2FBangkok";

export interface CurrentWeather {
  /** เวลาไทย "YYYY-MM-DDTHH:mm" ของค่าล่าสุด */
  time: string;
  /** ปริมาณฝน มม./ชม. (แปลงจากช่วงเวลาของค่าล่าสุด) */
  rainMmPerHour: number;
  cloudCover: number;
  weatherCode: number;
}

export function parseOpenMeteo(payload: unknown): CurrentWeather | null {
  const c = (payload as { current?: Record<string, unknown> })?.current;
  if (!c) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const precip = num(c.precipitation);
  const interval = num(c.interval) ?? 3600;
  const cloud = num(c.cloud_cover);
  const code = num(c.weather_code);
  if (typeof c.time !== "string" || precip === null || cloud === null || code === null || interval <= 0) return null;
  return { time: c.time, rainMmPerHour: (precip * 3600) / interval, cloudCover: cloud, weatherCode: code };
}

export async function getHatYaiWeather(): Promise<CurrentWeather | null> {
  try {
    const res = await fetch(ENDPOINT, { next: { revalidate: 600 }, signal: AbortSignal.timeout(10_000) });
    return res.ok ? parseOpenMeteo(await res.json()) : null;
  } catch {
    return null;
  }
}

/** ฝน/เมฆรายชั่วโมง — เวลาไทยรูปแบบเดียวกับข้อมูลระดับน้ำ ("YYYY-MM-DD HH:mm") เพื่อจับคู่ทีละชั่วโมง */
export interface HourlyWeather {
  at: string;
  rainMmPerHour: number;
  cloudCover: number;
}

export function parseOpenMeteoHourly(payload: unknown): HourlyWeather[] {
  const h = (payload as { hourly?: { time?: unknown[]; precipitation?: unknown[]; cloud_cover?: unknown[] } })?.hourly;
  if (!h || !Array.isArray(h.time) || !Array.isArray(h.precipitation)) return [];
  return h.time.flatMap((t, i) => {
    const mm = h.precipitation?.[i];
    const cloud = h.cloud_cover?.[i];
    if (typeof t !== "string" || typeof mm !== "number" || !Number.isFinite(mm)) return [];
    return [{ at: t.replace("T", " "), rainMmPerHour: mm, cloudCover: typeof cloud === "number" && Number.isFinite(cloud) ? cloud : 0 }];
  });
}

const HOURLY = "hourly=precipitation,cloud_cover&latitude=7.0&longitude=100.46&timezone=Asia%2FBangkok";

/**
 * ฝนรายชั่วโมงย้อนหลังที่หาดใหญ่
 * - ช่วงในอดีต (`start`–`end`) = แบบจำลองย้อนหลัง ERA5 ผ่าน Open-Meteo Archive (ข้อมูลไม่เปลี่ยน แคช 1 วัน)
 * - `recentDays` = ข้อมูลล่าสุดของ Open-Meteo (แคช 10 นาที)
 * ⚠️ แบบจำลองความละเอียด ~25 กม. มักต่ำกว่าฝนที่สถานีวัดได้จริงในพายุหนัก — ใช้แต่งภาพ ไม่ใช่ข้อมูลเตือนภัย
 */
export async function getRainHistory(range: { start: string; end: string } | { recentDays: number }): Promise<HourlyWeather[]> {
  const url =
    "recentDays" in range
      ? `https://api.open-meteo.com/v1/forecast?${HOURLY}&past_days=${range.recentDays}&forecast_days=1`
      : `https://archive-api.open-meteo.com/v1/archive?${HOURLY}&start_date=${range.start}&end_date=${range.end}`;
  try {
    const res = await fetch(url, { next: { revalidate: "recentDays" in range ? 600 : 86_400 }, signal: AbortSignal.timeout(15_000) });
    return res.ok ? parseOpenMeteoHourly(await res.json()) : [];
  } catch {
    return [];
  }
}

export interface DailyForecast {
  /** "YYYY-MM-DD" (เวลาไทย) */
  date: string;
  rainMm: number;
  /** โอกาสฝนสูงสุดของวัน (%) */
  probability: number | null;
  weatherCode: number | null;
}

export function parseOpenMeteoDaily(payload: unknown): DailyForecast[] {
  const d = (payload as { daily?: { time?: unknown[]; precipitation_sum?: unknown[]; precipitation_probability_max?: unknown[]; weather_code?: unknown[] } })?.daily;
  if (!d || !Array.isArray(d.time) || !Array.isArray(d.precipitation_sum)) return [];
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return d.time.flatMap((t, i) => {
    const mm = num(d.precipitation_sum?.[i]);
    if (typeof t !== "string" || mm === null) return [];
    return [{ date: t, rainMm: mm, probability: num(d.precipitation_probability_max?.[i]), weatherCode: num(d.weather_code?.[i]) }];
  });
}

/**
 * พยากรณ์ฝนที่หาดใหญ่ (Open-Meteo · แบบจำลองพยากรณ์อากาศ) — รายวัน 4 วัน + รายชั่วโมงตั้งแต่ชั่วโมงนี้ไป 72 ชม.
 * แคช 30 นาที · ล้มเหลว = รายการว่าง · พยากรณ์มีความไม่แน่นอน ไม่ใช่ประกาศเตือนภัย
 */
export async function getRainForecast(): Promise<{ daily: DailyForecast[]; hourly: HourlyWeather[] }> {
  const url =
    "https://api.open-meteo.com/v1/forecast?latitude=7.0&longitude=100.46&timezone=Asia%2FBangkok&forecast_days=4" +
    "&daily=precipitation_sum,precipitation_probability_max,weather_code&hourly=precipitation,cloud_cover";
  try {
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { daily: [], hourly: [] };
    const json = await res.json();
    // ตัดชั่วโมงที่ผ่านไปแล้ว (เทียบเวลาไทย) และเก็บ 72 ชม. ข้างหน้า
    const nowHour = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .format(new Date())
      .replace(/:\d\d$/, "");
    const hourly = parseOpenMeteoHourly(json).filter((h) => h.at.slice(0, 13) >= nowHour.slice(0, 13)).slice(0, 72);
    return { daily: parseOpenMeteoDaily(json), hourly };
  } catch {
    return { daily: [], hourly: [] };
  }
}
