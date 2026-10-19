// ช่วงสีฮีตแมประดับน้ำ (Owner Decision 2026-10-19)
// Pure Function — ใช้ร่วมกันทั้งการวาด canvas และคำอธิบายสัญลักษณ์ เพื่อให้สีตรงกันเสมอ
//
// เดิมมี 4 ช่วงและทุกค่า ≥ 1.5 ม. เป็นสีเดียว → พื้นที่ส่วนใหญ่กลายเป็นสีแดงทั้งแผนที่
// เจ้าของระบบยืนยันว่าระดับน้ำเกิน 5 ม. เป็นข้อมูลจริง ("เขาเจอมาหนักแบบนั้น")
// จึงแบ่ง 9 ช่วงไปจนถึง "5 ม. ขึ้นไป" และไม่ตัดค่าสูงทิ้ง
//
// สีโทนน้ำเงิน (สีน้ำ) — ไม่ใช้แดง/ส้ม เพราะสงวนไว้ให้หมุด "วิกฤต" บนแผนที่เดียวกัน
// สีจริงอยู่ใน globals.css (`--heat-1` … `--heat-9` อ้าง Token brand) คอมโพเนนต์อ้างชื่อตัวแปรเท่านั้น

export interface DepthBin {
  /** ลำดับ 1–9 (ตื้น → ลึก) ตรงกับตัวแปร CSS `--heat-{level}` */
  level: number;
  /** ขอบล่าง (ซม.) รวมค่านี้ */
  minCm: number;
  /** ขอบบน (ซม.) ไม่รวม · null = ไม่มีเพดาน */
  maxCm: number | null;
  label: string;
}

export const FLOOD_DEPTH_BINS: readonly DepthBin[] = [
  { level: 1, minCm: 0, maxCm: 30, label: "ต่ำกว่า 0.3 ม." },
  { level: 2, minCm: 30, maxCm: 60, label: "0.3–0.6 ม." },
  { level: 3, minCm: 60, maxCm: 100, label: "0.6–1 ม." },
  { level: 4, minCm: 100, maxCm: 150, label: "1–1.5 ม." },
  { level: 5, minCm: 150, maxCm: 200, label: "1.5–2 ม." },
  { level: 6, minCm: 200, maxCm: 300, label: "2–3 ม." },
  { level: 7, minCm: 300, maxCm: 400, label: "3–4 ม." },
  { level: 8, minCm: 400, maxCm: 500, label: "4–5 ม." },
  { level: 9, minCm: 500, maxCm: null, label: "5 ม. ขึ้นไป" },
];

/** ช่วงของระดับน้ำ · ค่าเพี้ยน (NaN/ติดลบ/null) → null (ไม่วาด ไม่เดาเป็นช่วงตื้นสุด) */
export function depthBin(cm: number | null | undefined): DepthBin | null {
  if (cm == null || !Number.isFinite(cm) || cm < 0) return null;
  for (let i = FLOOD_DEPTH_BINS.length - 1; i >= 0; i -= 1) {
    if (cm >= FLOOD_DEPTH_BINS[i].minCm) return FLOOD_DEPTH_BINS[i];
  }
  return null;
}

/** ชื่อตัวแปร CSS ของสีช่วงนั้น */
export function heatVar(level: number): string {
  return `--heat-${level}`;
}
