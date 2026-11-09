// สภาพอากาศปัจจุบันที่หาดใหญ่ (Open-Meteo · CC BY 4.0) — ใช้แต่งภาพส่วนหัว /lab/song-khlong เท่านั้น
// ดึงที่ server แคช 10 นาที · ล้มเหลว = null (ภาพแสดงตามเวลาอย่างเดียว ไม่วาดฝน) · ไม่ใช่ข้อมูลเตือนภัย
const ENDPOINT =
  "https://api.open-meteo.com/v1/forecast?latitude=7.0&longitude=100.46&timezone=Asia%2FBangkok&forecast_days=2" +
  "&current=precipitation,cloud_cover,weather_code,is_day,temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m" +
  "&hourly=temperature_2m,precipitation_probability,weather_code,is_day&daily=sunrise,sunset";
const AIR_ENDPOINT = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=7.0&longitude=100.46&timezone=Asia%2FBangkok&current=us_aqi,pm2_5";

export interface CurrentWeather {
  /** เวลาไทย "YYYY-MM-DDTHH:mm" ของค่าล่าสุด */
  time: string;
  /** ปริมาณฝน มม./ชม. (แปลงจากช่วงเวลาของค่าล่าสุด) */
  rainMmPerHour: number;
  cloudCover: number;
  weatherCode: number;
  temperature: number | null;
  feelsLike: number | null;
  humidity: number | null;
  windKmh: number | null;
  isDay: boolean;
}

/** ชั่วโมงข้างหน้า (การ์ดอากาศ) */
export interface HourOutlook {
  /** เวลาไทย "YYYY-MM-DD HH:mm" */
  at: string;
  temperature: number | null;
  /** โอกาสฝน (%) */
  probability: number | null;
  weatherCode: number | null;
  isDay: boolean;
}

export interface WeatherNow extends CurrentWeather {
  /** ชั่วโมงนี้ + 6 ชม. ข้างหน้า */
  next: HourOutlook[];
  /** เวลาไทย "HH:mm" */
  sunrise: string | null;
  sunset: string | null;
  /** ดัชนีคุณภาพอากาศ (US AQI) และ PM2.5 (µg/m³) — Open-Meteo Air Quality */
  aqi: number | null;
  pm25: number | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function parseOpenMeteo(payload: unknown): CurrentWeather | null {
  const c = (payload as { current?: Record<string, unknown> })?.current;
  if (!c) return null;
  const precip = num(c.precipitation);
  const interval = num(c.interval) ?? 3600;
  const cloud = num(c.cloud_cover);
  const code = num(c.weather_code);
  if (typeof c.time !== "string" || precip === null || cloud === null || code === null || interval <= 0) return null;
  return {
    time: c.time,
    rainMmPerHour: (precip * 3600) / interval,
    cloudCover: cloud,
    weatherCode: code,
    temperature: num(c.temperature_2m),
    feelsLike: num(c.apparent_temperature),
    humidity: num(c.relative_humidity_2m),
    windKmh: num(c.wind_speed_10m),
    isDay: c.is_day !== 0,
  };
}

/** ชั่วโมงนี้ (ตามเวลาของค่าปัจจุบัน) + 6 ชม. ข้างหน้า จาก hourly ของ Open-Meteo */
export function parseOutlook(payload: unknown, currentTime: string): HourOutlook[] {
  const h = (payload as { hourly?: Record<string, unknown[]> })?.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  const hour = currentTime.slice(0, 13); // "YYYY-MM-DDTHH"
  const start = h.time.findIndex((t) => typeof t === "string" && t.slice(0, 13) >= hour);
  if (start < 0) return [];
  return h.time.slice(start, start + 7).flatMap((t, k) => {
    const i = start + k;
    if (typeof t !== "string") return [];
    return [
      {
        at: t.replace("T", " "),
        temperature: num(h.temperature_2m?.[i]),
        probability: num(h.precipitation_probability?.[i]),
        weatherCode: num(h.weather_code?.[i]),
        isDay: h.is_day?.[i] !== 0,
      },
    ];
  });
}

/** อากาศตอนนี้ที่หาดใหญ่ + รายชั่วโมงข้างหน้า + พระอาทิตย์ + คุณภาพอากาศ (แคช 10 นาที · ล้มเหลว = null) */
export async function getHatYaiWeather(): Promise<WeatherNow | null> {
  try {
    const [res, air] = await Promise.all([
      fetch(ENDPOINT, { next: { revalidate: 600 }, signal: AbortSignal.timeout(10_000) }),
      fetch(AIR_ENDPOINT, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(10_000) }).catch(() => null),
    ]);
    if (!res.ok) return null;
    const json = await res.json();
    const current = parseOpenMeteo(json);
    if (!current) return null;
    const daily = (json as { daily?: { sunrise?: unknown[]; sunset?: unknown[] } }).daily;
    const hhmm = (v: unknown) => (typeof v === "string" ? v.slice(11, 16) : null);
    const airJson = air && air.ok ? ((await air.json()) as { current?: Record<string, unknown> }) : null;
    return {
      ...current,
      next: parseOutlook(json, current.time),
      sunrise: hhmm(daily?.sunrise?.[0]),
      sunset: hhmm(daily?.sunset?.[0]),
      aqi: num(airJson?.current?.us_aqi),
      pm25: num(airJson?.current?.pm2_5),
    };
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
