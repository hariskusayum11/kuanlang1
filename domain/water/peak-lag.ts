// เวลาที่ยอดน้ำเดินทางระหว่างสถานี (หน้าต้นแบบ /lab/song-khlong) — Pure Function
import type { HistoryPoint } from "./station-status";

/**
 * เวลาห่างของยอดน้ำระหว่างสถานีต้นน้ำ → ปลายน้ำ (ชม.) จากเหตุการณ์เดียวกัน
 * ผลลบ หรือเกิน `maxHours` ถือว่าใช้ไม่ได้ (เช่น เครื่องวัดต้นน้ำค้างค่าเพดาน) → null — ห้ามเดาเวลาเดินทางของน้ำ
 */
export function peakLagHours(upstream: readonly HistoryPoint[], downstream: readonly HistoryPoint[], maxHours = 72): number | null {
  const peak = (pts: readonly HistoryPoint[]) => pts.reduce<HistoryPoint | null>((b, p) => (b === null || p.levelMsl > b.levelMsl ? p : b), null);
  const a = peak(upstream);
  const b = peak(downstream);
  if (!a || !b) return null;
  // เวลาไทย "YYYY-MM-DD HH:mm" — เทียบกันเองเป็นเขตเวลาเดียวกัน จึงแปลงแบบ UTC ได้
  const t = (s: string) => Date.parse(`${s.replace(" ", "T")}:00Z`);
  const hours = (t(b.at) - t(a.at)) / 3_600_000;
  return Number.isFinite(hours) && hours > 0 && hours <= maxHours ? hours : null;
}
