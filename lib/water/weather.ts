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
