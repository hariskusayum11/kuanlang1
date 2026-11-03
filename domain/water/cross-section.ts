// รูปตัดขวางลำน้ำจริง + การเดินทางของยอดน้ำ (หน้าต้นแบบ /lab/song-khlong) — Pure Function
// -----------------------------------------------------------------------------
// รูปตัดขวาง: กรมชลประทาน "รูปตัดขวางลำน้ำ สถานี X.44 คลองอู่ตะเภา บ้านหาดใหญ่ใน" ประจำปี 2569
// (สำรวจ 7 ม.ค. 2569) — ระยะ (ม.) จากหมุดฝั่งซ้าย × ระดับ (ม.รทก.)
// ตัดจุดผนังบาง ๆ ที่ระยะ 9 ม. (ยอด 7.237) ออก เพื่อให้รูปอ่านง่าย — ไม่กระทบพื้นที่หน้าตัดน้ำช่วงปกติ
import type { HistoryPoint } from "./station-status";

export type ProfilePoint = readonly [distanceM: number, levelMsl: number];

export interface CrossSection {
  stationCode: string;
  surveyedOn: string;
  sourceUrl: string;
  points: readonly ProfilePoint[];
}

export const X44_CROSS_SECTION: CrossSection = {
  stationCode: "X.44",
  surveyedOn: "2026-01-07",
  sourceUrl: "https://hydro-8.com/main/Submenu/DownloadFiles/CrossSection/CS_X44.pdf",
  points: [
    [-30, 8.219], [-25, 8.311], [-20, 8.412], [-15, 8.501], [-10, 8.538], [-5, 8.645], [0, 8.682], [0, 7.916],
    [5, 6.064], [9, 5.236], [9.25, 4.305], [14, 1.724], [15, 1.539], [20, 0.947], [25, -0.063], [30, -1.353],
    [35, -2.053], [40, -2.353], [45, -1.413], [50, -0.383], [52.5, 0.947], [55, 1.579], [60, 4.696], [65, 6.693],
    [70, 6.524], [73, 7.57], [73, 8.679], [78, 8.567], [83, 8.288], [88, 8.112], [93, 7.954], [98, 7.761], [103, 7.634],
  ],
};

/**
 * พื้นที่น้ำในรูปตัดขวางที่ระดับ `levelMsl` — คืนรูปหลายเหลี่ยม (จุด [ระยะ, ระดับ]) ทุกช่วงที่พื้นต่ำกว่าผิวน้ำ
 * ตัดกับพื้นแบบเชิงเส้นตรงจุดที่ผิวน้ำแตะตลิ่ง · ระดับไม่ถูกต้อง = ไม่มีน้ำ (ไม่วาดจากข้อมูลที่เชื่อไม่ได้)
 * ช่วงที่ต่ำกว่าผิวน้ำถึงขอบรูป ถือว่าน้ำต่อเนื่องออกไปนอกรูป (เช่น น้ำท่วมสูงกว่าตลิ่ง)
 */
export function waterPolygons(points: readonly ProfilePoint[], levelMsl: number | null): Array<Array<[number, number]>> {
  if (levelMsl === null || !Number.isFinite(levelMsl) || points.length < 2) return [];
  const polys: Array<Array<[number, number]>> = [];
  let run: Array<[number, number]> | null = null;
  const below = (p: ProfilePoint) => p[1] < levelMsl;
  const cross = (a: ProfilePoint, b: ProfilePoint): [number, number] => {
    const t = (levelMsl - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), levelMsl];
  };
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (below(p)) {
      if (!run) run = i === 0 || !prev ? [[p[0], levelMsl]] : [cross(prev, p)];
      run.push([p[0], p[1]]);
    } else if (run && prev) {
      run.push(cross(prev, p));
      polys.push(run);
      run = null;
    }
  });
  if (run) {
    const last = points.at(-1)!;
    (run as Array<[number, number]>).push([last[0], levelMsl]);
    polys.push(run);
  }
  return polys;
}

/** ความกว้างผิวน้ำรวม (ม.) — ใช้บอกขนาดลำน้ำที่ระดับนั้น */
export function wetWidth(polys: Array<Array<[number, number]>>): number {
  return polys.reduce((sum, poly) => {
    const xs = poly.map((p) => p[0]);
    return sum + (Math.max(...xs) - Math.min(...xs));
  }, 0);
}

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
