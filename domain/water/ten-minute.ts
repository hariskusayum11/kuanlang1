// ค่าระดับน้ำทุก 10 นาที (สถานีโทรมาตรของ สสน.) — ข้อมูลเสริมระหว่างชั่วโมง · Pure Function
// -----------------------------------------------------------------------------
// สถานีกรมชลประทานที่สะพานส่งค่ารายชั่วโมง — สถานีของ สสน. ที่ตั้งอยู่จุดเดียวกันส่งค่าทุก 10 นาที
// จึงใช้ดู "น้ำกำลังขึ้นหรือลงตอนนี้" ระหว่างชั่วโมงได้ (docs/44 §5)
// ⚠️ ไม่ใช้ตัดสินธง: สองสถานีอ้างอิงคนละหมุด ค่าจึงต่างกันคงที่ระดับหนึ่ง (บางศาลา ~0.15 ม.)
//    ระบบจึงคำนวณส่วนต่างจากข้อมูลจริงทุกครั้ง แทนการปรับค่าเองด้วยตัวเลขคงที่ในโค้ด
import type { HistoryPoint, WaterTrend } from "./station-status";

/** ช่วงที่ใช้ดูการเปลี่ยนแปลงล่าสุด (นาที) */
export const TEN_MINUTE_WINDOW = 30;
/** ต่างไม่เกินนี้ (ม.) ในช่วง 30 นาที ถือว่าทรงตัว */
export const TEN_MINUTE_STEADY_M = 0.02;
/** ค่าล่าสุดเก่ากว่านี้ (นาที) = สถานีอาจขัดข้อง — แสดงว่าค่าเก่า */
export const TEN_MINUTE_STALE_AFTER = 60;
/** ต้องมีเวลาที่ตรงกันอย่างน้อยเท่านี้จึงบอกส่วนต่างกับสถานีคู่ */
const MIN_SHARED_POINTS = 6;

export interface TenMinuteSummary {
  code: string;
  name: string;
  /** รหัสสถานีกรมชลประทานที่อยู่จุดเดียวกัน (เช่น X.90) */
  pairedWith: string;
  latestAt: string;
  levelMsl: number;
  /** เปลี่ยนไปเท่าไรในช่วง `windowMinutes` ล่าสุด (ม.) · null = ข้อมูลช่วงนั้นขาด */
  changeM: number | null;
  windowMinutes: number;
  trend: WaterTrend;
  /** ค่าสถานีนี้ − ค่าสถานีคู่ ณ เวลาเดียวกัน (มัธยฐาน, ม.) · null = เวลาตรงกันไม่พอ */
  offsetM: number | null;
  /** ค่าล่าสุดเก่ากว่า TEN_MINUTE_STALE_AFTER นาที */
  stale: boolean;
}

/** "YYYY-MM-DD HH:mm" → นาทีนับจาก epoch (ใช้เทียบช่วงเวลาเท่านั้น ไม่สนเขตเวลา) · รูปแบบผิด = null */
export function stampMinutes(at: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(at);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  return Number.isFinite(ms) ? ms / 60_000 : null;
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizeTenMinute(input: {
  code: string;
  name: string;
  pairedWith: string;
  points: readonly HistoryPoint[];
  /** ค่ารายชั่วโมงของสถานีคู่ — ใช้หาส่วนต่าง */
  pairedPoints: readonly HistoryPoint[];
  /** เวลาไทยตอนนี้ "YYYY-MM-DD HH:mm" */
  now: string;
  windowMinutes?: number;
}): TenMinuteSummary | null {
  const windowMinutes = input.windowMinutes ?? TEN_MINUTE_WINDOW;
  const pts = input.points
    .map((p) => ({ ...p, t: stampMinutes(p.at) }))
    .filter((p): p is HistoryPoint & { t: number } => p.t !== null && Number.isFinite(p.levelMsl))
    .sort((a, b) => a.t - b.t);
  const last = pts.at(-1);
  if (!last) return null;

  // ค่าฐาน = จุดล่าสุดที่เก่ากว่าช่วงที่ดู แต่ไม่เก่าเกินไปอีก 20 นาที (ข้อมูลขาดช่วง = ไม่บอกการเปลี่ยนแปลง)
  const base = [...pts].reverse().find((p) => p.t <= last.t - windowMinutes);
  const changeM = base && base.t >= last.t - windowMinutes - 20 ? round2(last.levelMsl - base.levelMsl) : null;
  const trend: WaterTrend = changeM === null ? "UNKNOWN" : Math.abs(changeM) <= TEN_MINUTE_STEADY_M ? "STEADY" : changeM > 0 ? "RISING" : "FALLING";

  const byStamp = new Map(pts.map((p) => [p.t, p.levelMsl]));
  const diffs = input.pairedPoints.flatMap((p) => {
    const t = stampMinutes(p.at);
    const own = t === null ? undefined : byStamp.get(t);
    return own !== undefined && Number.isFinite(p.levelMsl) ? [own - p.levelMsl] : [];
  });
  const offsetM = diffs.length >= MIN_SHARED_POINTS ? round2(median(diffs)) : null;

  const now = stampMinutes(input.now);
  return {
    code: input.code,
    name: input.name,
    pairedWith: input.pairedWith,
    latestAt: last.at,
    levelMsl: last.levelMsl,
    changeM,
    windowMinutes,
    trend,
    offsetM,
    stale: now === null || now - last.t > TEN_MINUTE_STALE_AFTER,
  };
}

/** "30 นาทีล่าสุด น้ำขึ้น 5 ซม." — ข้อความเดียวกันทั้งส่วนหัวและป๊อปอัปแผนที่ */
export function tenMinuteChangeText(s: Pick<TenMinuteSummary, "changeM" | "trend" | "windowMinutes">): string {
  if (s.changeM === null || s.trend === "UNKNOWN") return "ข้อมูลช่วงล่าสุดขาด ยังบอกการขึ้นลงไม่ได้";
  const cm = Math.round(Math.abs(s.changeM) * 100);
  if (s.trend === "STEADY") return `${s.windowMinutes} นาทีล่าสุด ทรงตัว${cm ? ` (${s.changeM > 0 ? "+" : "−"}${cm} ซม.)` : ""}`;
  return `${s.windowMinutes} นาทีล่าสุด ${s.trend === "RISING" ? "น้ำขึ้น" : "น้ำลง"} ${cm} ซม.`;
}
