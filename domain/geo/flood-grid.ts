// แผนที่ความรุนแรงน้ำท่วมแบบช่องพื้นที่ สำหรับหน้าสาธารณะ (Owner Decision 2026-10-19 · docs/39)
// Pure Function — รับแถวครัวเรือน (พิกัด + คำตอบด้านน้ำท่วม) คืนช่องตารางพร้อมค่าเฉลี่ย
//
// ความเป็นส่วนตัว: หน้าสาธารณะห้ามแสดงข้อมูลรายบ้าน จึง
//   - รวมเป็นช่องประมาณ 200 × 200 ม. และส่งออกเฉพาะ "กรอบช่อง" ไม่ใช่พิกัดบ้าน
//   - ไม่แสดงช่องที่มีครัวเรือนน้อยกว่า 5 หลัง (กันย้อนระบุบ้าน — เกณฑ์เดียวกับตัวเลขสาธารณะอื่น)
// ระดับน้ำเกิน 5 ม. เป็นข้อมูลจริง (เจ้าของระบบยืนยัน) จึงไม่ตัดค่าสูงทิ้ง

import { depthBin } from "../flood/depth-scale";

export const GRID_CELL_METERS = 200;
export const GRID_MIN_HOUSEHOLDS = 5;
const METERS_PER_DEGREE_LAT = 111_320;

export interface FloodGridInput {
  lat: number;
  lng: number;
  /** ระดับน้ำสูงสุดที่เคยท่วม (ซม.) · null = ไม่ได้ตอบ */
  depthCm: number | null;
  /** พื้นบ้านต่ำกว่าถนน · null = ไม่ได้ตอบ (ไม่นับในตัวหาร) */
  belowRoad: boolean | null;
  /** จำนวนวันที่ท่วมครั้งล่าสุด · null = ไม่ได้ตอบ */
  durationDays: number | null;
}

export interface FloodGridCell {
  /** [south, west, north, east] */
  bounds: [number, number, number, number];
  households: number;
  avgDepthCm: number | null;
  depthAnswered: number;
  belowRoadPercent: number | null;
  floorAnswered: number;
  avgDurationDays: number | null;
  durationAnswered: number;
}

export type GridMetric = "depth" | "belowRoad" | "duration";

export interface GridLegendStep {
  level: number;
  label: string;
}

export const GRID_METRIC_LABELS: Record<GridMetric, string> = {
  depth: "ระดับน้ำเฉลี่ยที่เคยท่วม",
  belowRoad: "สัดส่วนบ้านพื้นต่ำกว่าถนน",
  duration: "จำนวนวันที่ท่วมเฉลี่ย",
};

const BELOW_ROAD_STEPS: Array<{ min: number; level: number; label: string }> = [
  { min: 80, level: 9, label: "80% ขึ้นไป" },
  { min: 60, level: 7, label: "60–79%" },
  { min: 40, level: 5, label: "40–59%" },
  { min: 20, level: 4, label: "20–39%" },
  { min: 0, level: 2, label: "ต่ำกว่า 20%" },
];

const DURATION_STEPS: Array<{ min: number; level: number; label: string }> = [
  { min: 14, level: 9, label: "14 วันขึ้นไป" },
  { min: 7, level: 8, label: "7–13 วัน" },
  { min: 3, level: 6, label: "3–6 วัน" },
  { min: 1, level: 4, label: "1–2 วัน" },
  { min: 0, level: 2, label: "ไม่ถึง 1 วัน" },
];

function isValid(n: number | null): n is number {
  return n != null && Number.isFinite(n) && n >= 0;
}

/**
 * รวมครัวเรือนเป็นช่องตาราง
 * ขนาดช่องทางลองจิจูดคิดจากละติจูดอ้างอิง (ค่ากลางของข้อมูล) เพื่อให้ช่องเกือบเป็นสี่เหลี่ยมจัตุรัสในพื้นที่จริง
 */
export function buildFloodGrid(
  rows: readonly FloodGridInput[],
  options: { cellMeters?: number; minHouseholds?: number } = {},
): FloodGridCell[] {
  const cellMeters = options.cellMeters ?? GRID_CELL_METERS;
  const minHouseholds = options.minHouseholds ?? GRID_MIN_HOUSEHOLDS;
  const valid = rows.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180);
  if (valid.length === 0) return [];

  const refLat = valid.reduce((sum, r) => sum + r.lat, 0) / valid.length;
  const latStep = cellMeters / METERS_PER_DEGREE_LAT;
  const lngStep = cellMeters / (METERS_PER_DEGREE_LAT * Math.max(0.1, Math.cos((refLat * Math.PI) / 180)));

  const cells = new Map<string, { i: number; j: number; rows: FloodGridInput[] }>();
  for (const row of valid) {
    const i = Math.floor(row.lat / latStep);
    const j = Math.floor(row.lng / lngStep);
    const key = `${i}:${j}`;
    const cell = cells.get(key) ?? { i, j, rows: [] };
    cell.rows.push(row);
    cells.set(key, cell);
  }

  const result: FloodGridCell[] = [];
  for (const { i, j, rows: members } of cells.values()) {
    if (members.length < minHouseholds) continue;
    const depths = members.map((m) => m.depthCm).filter(isValid);
    const floors = members.map((m) => m.belowRoad).filter((v): v is boolean => v !== null);
    const durations = members.map((m) => m.durationDays).filter(isValid);
    const round = (n: number, step: number) => Math.round(n / step) * step;
    result.push({
      bounds: [i * latStep, j * lngStep, (i + 1) * latStep, (j + 1) * lngStep].map((n) => Number(n.toFixed(6))) as FloodGridCell["bounds"],
      households: members.length,
      avgDepthCm: depths.length ? round(depths.reduce((a, b) => a + b, 0) / depths.length, 5) : null,
      depthAnswered: depths.length,
      belowRoadPercent: floors.length ? Math.round((floors.filter(Boolean).length / floors.length) * 100) : null,
      floorAnswered: floors.length,
      avgDurationDays: durations.length ? Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10 : null,
      durationAnswered: durations.length,
    });
  }
  return result.sort((a, b) => a.bounds[0] - b.bounds[0] || a.bounds[1] - b.bounds[1]);
}

/** ระดับสี 1–9 (ตรงกับ --heat-*) ของช่องตามตัวชี้วัด · null = ช่องนี้ไม่มีคำตอบของตัวชี้วัดนั้น (ไม่วาด) */
export function gridLevel(cell: FloodGridCell, metric: GridMetric): number | null {
  if (metric === "depth") return cell.avgDepthCm == null ? null : (depthBin(cell.avgDepthCm)?.level ?? null);
  if (metric === "belowRoad") {
    if (cell.belowRoadPercent == null) return null;
    return BELOW_ROAD_STEPS.find((s) => cell.belowRoadPercent! >= s.min)?.level ?? null;
  }
  if (cell.avgDurationDays == null) return null;
  return DURATION_STEPS.find((s) => cell.avgDurationDays! >= s.min)?.level ?? null;
}

/** คำอธิบายสัญลักษณ์ของตัวชี้วัด (บนสุด = รุนแรงสุด) — ความลึกใช้ช่วงเดียวกับฮีตแมปภายใน */
export function gridLegend(metric: GridMetric, depthSteps: readonly GridLegendStep[]): GridLegendStep[] {
  if (metric === "depth") return [...depthSteps].reverse();
  const steps = metric === "belowRoad" ? BELOW_ROAD_STEPS : DURATION_STEPS;
  return steps.map(({ level, label }) => ({ level, label }));
}
