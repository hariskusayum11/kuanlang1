// =============================================================================
// Coverage Gauge Geometry — Pure Functions
// -----------------------------------------------------------------------------
// เรขาคณิตของเกจครึ่งวงกลมที่ใช้แสดง Coverage — แยกจากคอมโพเนนต์เพื่อทดสอบได้
// ไม่มี DOM / ไม่มี React (tests/unit/gauge-geometry.test.ts)
//
// ระบบพิกัด: SVG (y ชี้ลง) · เกจกวาดจากซ้าย (180°) ไปขวา (0°) ผ่านด้านบน
// =============================================================================

export interface Point {
  x: number;
  y: number;
}

export interface GaugeArc {
  /** ค่าที่ clamp แล้ว 0–100 (ใช้วาด — ค่าจริงเกิน 100 ได้แต่เข็มหยุดที่ปลาย) */
  clampedPercent: number;
  /** path สำหรับ <path d> */
  d: string;
  /** จุดปลายส่วนโค้ง — ใช้วางหัวเข็ม/จุดไฮไลต์ */
  end: Point;
}

/** แปลงเปอร์เซ็นต์ (0–100) เป็นองศาบนเกจครึ่งวงกลม: 0% = 180°, 100% = 0° */
export function percentToAngle(percent: number): number {
  const p = clampPercent(percent);
  return 180 - (p * 180) / 100;
}

/**
 * บีบค่าให้อยู่ในช่วง 0–100 สำหรับ "การวาด" เท่านั้น (ตัวเลขที่แสดงยังเป็นค่าจริง)
 *
 * ค่าที่ไม่ใช่ตัวเลขจริง (NaN / ±Infinity) = ข้อมูลต้นทางเพี้ยน → คืน 0 ทั้งหมด
 * เจตนา: ถ้าวาดเป็น 100 เกจจะโชว์ว่า "ผ่านเป้า" จากข้อมูลที่เชื่อถือไม่ได้
 * ซึ่งอันตรายกว่าการโชว์เกจว่าง — เลือกพลาดไปทางน้อยกว่าความจริงเสมอ
 */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  if (percent < 0) return 0;
  if (percent > 100) return 100;
  return percent;
}

/** จุดบนวงกลมที่มุมองศาที่กำหนด (0° = ขวา, 90° = บนสุด) */
export function polarPoint(cx: number, cy: number, r: number, angleDeg: number): Point {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: round(cx + r * Math.cos(rad)),
    y: round(cy - r * Math.sin(rad)),
  };
}

/**
 * ส่วนโค้งของเกจตั้งแต่ 0% ถึง percent ที่ระบุ
 * ใช้ large-arc-flag = 0 และ sweep-flag = 1 เสมอ เพราะกวาดไม่เกินครึ่งวงกลม
 */
export function gaugeArc(
  cx: number,
  cy: number,
  r: number,
  percent: number,
): GaugeArc {
  const clampedPercent = clampPercent(percent);
  const start = polarPoint(cx, cy, r, 180);
  const end = polarPoint(cx, cy, r, percentToAngle(clampedPercent));

  // 0% = ยังไม่มีส่วนโค้ง — คืน path ว่างไม่ให้เกิดจุดทึบค้างบนเกจ
  if (clampedPercent === 0) {
    return { clampedPercent, d: "", end: start };
  }

  return {
    clampedPercent,
    d: `M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`,
    end,
  };
}

/** ขีดบอกเป้าหมาย (เช่น 60%) — คืนจุดต้น/ปลายของขีดที่พาดขวางแนวราง */
export function targetTick(
  cx: number,
  cy: number,
  r: number,
  thickness: number,
  targetPercent: number,
): { from: Point; to: Point } {
  const angle = percentToAngle(targetPercent);
  const half = thickness / 2 + 2;
  return {
    from: polarPoint(cx, cy, r - half, angle),
    to: polarPoint(cx, cy, r + half, angle),
  };
}

/** ปัดทศนิยม 2 ตำแหน่ง — path สั้นลงและผลลัพธ์คงที่พอสำหรับ snapshot test */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
