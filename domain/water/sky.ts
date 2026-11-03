// ท้องฟ้าของภาพส่วนหัว (หน้าต้นแบบ /lab/song-khlong) — ช่วงเวลาของวัน + ฝน/เมฆ — Pure Function
// -----------------------------------------------------------------------------
// ใช้แต่งภาพให้ตรงกับตอนที่คนเปิดดู (เช้า/กลางวัน/เย็น/กลางคืน · ฝนตกหรือไม่) — ไม่ใช่ข้อมูลเตือนภัย

export type DayPhase = "dawn" | "day" | "dusk" | "night";
export type RainLevel = "none" | "light" | "moderate" | "heavy";

/** ช่วงเวลาของวันจากเวลาไทย (ชั่วโมง 0–23, นาที) — รุ่งเช้า 05:30–07:00 · กลางวัน · โพล้เพล้ 17:30–19:00 · กลางคืน */
export function dayPhase(hour: number, minute = 0): DayPhase {
  const t = hour * 60 + minute;
  if (t >= 330 && t < 420) return "dawn";
  if (t >= 420 && t < 1050) return "day";
  if (t >= 1050 && t < 1140) return "dusk";
  return "night";
}

/**
 * ระดับฝนจากปริมาณ มม./ชม. — เกณฑ์สากล: ปรอย/เล็กน้อย < 2.5 · ปานกลาง 2.5–7.6 · หนัก > 7.6
 * ต่ำกว่า 0.1 ถือว่าไม่ตก · ค่าเพี้ยน = ไม่ตก (ไม่วาดฝนจากข้อมูลที่เชื่อไม่ได้)
 */
export function rainLevel(mmPerHour: number | null): RainLevel {
  if (mmPerHour === null || !Number.isFinite(mmPerHour) || mmPerHour < 0.1) return "none";
  if (mmPerHour < 2.5) return "light";
  if (mmPerHour <= 7.6) return "moderate";
  return "heavy";
}

/** คำอธิบายอากาศจากรหัส WMO (ที่ Open-Meteo ใช้) */
export function weatherLabel(code: number | null): string {
  if (code === null || !Number.isFinite(code)) return "ไม่ทราบสภาพอากาศ";
  if (code === 0) return "ท้องฟ้าแจ่มใส";
  if (code <= 3) return "มีเมฆ";
  if (code === 45 || code === 48) return "มีหมอก";
  if (code >= 51 && code <= 57) return "ฝนปรอย";
  if (code >= 61 && code <= 67) return "ฝนตก";
  if (code >= 80 && code <= 82) return "ฝนตกเป็นช่วง ๆ";
  if (code >= 95) return "พายุฝนฟ้าคะนอง";
  return "มีเมฆ";
}

/**
 * ระดับฝนรายวัน (มม./วัน) ตามเกณฑ์กรมอุตุนิยมวิทยา:
 * ไม่มีฝน < 0.1 · เล็กน้อย 0.1–10 · ปานกลาง 10.1–35 · หนัก 35.1–90 · หนักมาก > 90
 */
export type DailyRain = "none" | "light" | "moderate" | "heavy" | "veryHeavy";
export function dailyRain(mm: number | null): DailyRain {
  if (mm === null || !Number.isFinite(mm) || mm < 0.1) return "none";
  if (mm <= 10) return "light";
  if (mm <= 35) return "moderate";
  if (mm <= 90) return "heavy";
  return "veryHeavy";
}
export const DAILY_RAIN_LABEL: Record<DailyRain, string> = {
  none: "ไม่มีฝน",
  light: "ฝนเล็กน้อย",
  moderate: "ฝนปานกลาง",
  heavy: "ฝนหนัก",
  veryHeavy: "ฝนหนักมาก",
};
