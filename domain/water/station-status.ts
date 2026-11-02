// สถานะน้ำจากสถานีวัดระดับน้ำ (หน้าต้นแบบ /lab/song-khlong) — Pure Function
// -----------------------------------------------------------------------------
// ข้อมูลจากคลังข้อมูลน้ำแห่งชาติ (ThaiWater) — ระดับน้ำ (ม.รทก.) เทียบระดับตลิ่งต่ำสุดของสถานี
// เกณฑ์แบ่งสถานะด้านล่างเป็น **ฉบับร่างของต้นแบบ** ยังไม่ได้รับรอง — ใช้ระยะห่างจากตลิ่ง
// (ม.) เพราะเข้าใจง่ายและไม่ขึ้นกับความลึกของแต่ละสถานี

export type WaterStatus = "NORMAL" | "WATCH" | "WARNING" | "OVERFLOW" | "UNKNOWN";
export type WaterTrend = "RISING" | "FALLING" | "STEADY" | "UNKNOWN";

export interface StationReading {
  code: string;
  name: string;
  river: string;
  lat: number;
  lng: number;
  /** ระดับน้ำ (ม.รทก.) */
  levelMsl: number | null;
  /** ระดับน้ำครั้งก่อน (ม.รทก.) */
  previousMsl: number | null;
  /** ระดับตลิ่งต่ำสุด (ม.รทก.) */
  bankMsl: number | null;
  /** ระดับท้องน้ำ/พื้น (ม.รทก.) — ใช้เป็นฐานของไม้วัด */
  groundMsl: number | null;
  /** เวลาที่วัด (เวลาไทย "YYYY-MM-DD HH:mm") */
  measuredAt: string | null;
  agency: string | null;
}

/** ฉบับร่าง: ห่างตลิ่งเกิน 3 ม. ปกติ · 1.5–3 ม. เฝ้าระวัง · 0–1.5 ม. เตือนภัย · ≤ 0 ล้นตลิ่ง */
export const STATUS_THRESHOLDS_M = { watch: 3, warning: 1.5 } as const;
/** ต่างจากครั้งก่อนไม่เกินนี้ (ม.) ถือว่าทรงตัว */
export const STEADY_EPSILON_M = 0.03;

export const WATER_STATUS_LABEL: Record<WaterStatus, string> = {
  NORMAL: "ปกติ",
  WATCH: "เฝ้าระวัง",
  WARNING: "เตือนภัย",
  OVERFLOW: "ล้นตลิ่ง",
  UNKNOWN: "ไม่มีข้อมูล",
};

export const WATER_TREND_LABEL: Record<WaterTrend, string> = {
  RISING: "น้ำขึ้น",
  FALLING: "น้ำลง",
  STEADY: "ทรงตัว",
  UNKNOWN: "ไม่ทราบแนวโน้ม",
};

const finite = (n: number | null): n is number => n !== null && Number.isFinite(n);

/** ระยะจากผิวน้ำถึงตลิ่ง (ม.) — บวก = ต่ำกว่าตลิ่ง · ลบ = ล้นตลิ่ง */
export function freeboard(r: Pick<StationReading, "levelMsl" | "bankMsl">): number | null {
  return finite(r.levelMsl) && finite(r.bankMsl) ? r.bankMsl - r.levelMsl : null;
}

export function waterStatus(r: Pick<StationReading, "levelMsl" | "bankMsl">): WaterStatus {
  const fb = freeboard(r);
  if (fb === null) return "UNKNOWN";
  if (fb <= 0) return "OVERFLOW";
  if (fb <= STATUS_THRESHOLDS_M.warning) return "WARNING";
  if (fb <= STATUS_THRESHOLDS_M.watch) return "WATCH";
  return "NORMAL";
}

export function waterTrend(r: Pick<StationReading, "levelMsl" | "previousMsl">): WaterTrend {
  if (!finite(r.levelMsl) || !finite(r.previousMsl)) return "UNKNOWN";
  const diff = r.levelMsl - r.previousMsl;
  if (Math.abs(diff) <= STEADY_EPSILON_M) return "STEADY";
  return diff > 0 ? "RISING" : "FALLING";
}

/**
 * สัดส่วนน้ำในไม้วัด 0–1 (ท้องน้ำ → ตลิ่ง) · เกินตลิ่งได้ถึง 1.2 เพื่อให้เห็นว่าล้น
 * ข้อมูลบางสถานีมีระดับพื้นสูงกว่าตลิ่ง (ค่าผิดปกติจากต้นทาง) → ใช้ฐาน 10 ม. ใต้ตลิ่งแทน
 */
export function gaugeFill(r: Pick<StationReading, "levelMsl" | "bankMsl" | "groundMsl">): number | null {
  if (!finite(r.levelMsl) || !finite(r.bankMsl)) return null;
  const base = finite(r.groundMsl) && r.groundMsl < r.bankMsl ? r.groundMsl : r.bankMsl - 10;
  const fill = (r.levelMsl - base) / (r.bankMsl - base);
  return Math.max(0, Math.min(1.2, fill));
}

/** ความเร็วการไหลบนแผนที่ (เท่าของปกติ) — ยิ่งใกล้ตลิ่งยิ่งเร็ว */
export function flowSpeed(status: WaterStatus): number {
  return { NORMAL: 1, WATCH: 1.6, WARNING: 2.4, OVERFLOW: 3.2, UNKNOWN: 0.6 }[status];
}

/**
 * คลอง ร.1 ไม่มีสถานีวัดเป็นตัวเลข (Owner Decision 2026-11-02 แบบ ก)
 * จำลองความแรงการไหลจากสถานะของคลองอู่ตะเภา: ปกติประตูระบายน้ำเปิดน้อย → ไหลอ่อน
 * เมื่อคลองอู่ตะเภาสูง น้ำก้อนใหญ่ถูกผันเข้าคลอง ร.1 (เส้นทางที่ 4 ของอุทกภัยปี 68)
 */
export function r1SimulatedIntensity(utapao: WaterStatus): number {
  return { NORMAL: 0.35, WATCH: 0.7, WARNING: 1, OVERFLOW: 1, UNKNOWN: 0.25 }[utapao];
}
