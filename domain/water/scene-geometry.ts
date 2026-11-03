// เรขาคณิตของฉากน้ำหน้า "สองคลอง" (ภาพประกอบ SVG viewBox 1600×900) — Pure Function
// -----------------------------------------------------------------------------
// ฉากยึด "ระดับตลิ่ง" ของสถานีไว้ที่ความสูงคงที่ (BANK_Y = ขอบบนกำแพงคลอง/พื้นดินที่บ้านตั้ง)
// แล้วแปลงระดับน้ำ (ม.รทก.) เป็นพิกัด y ด้วยมาตราส่วนเดียวกับตัวบ้านในภาพ (ประตูสูง 2 ม. = 72px)
// เพื่อให้ "น้ำท่วมสูงกว่าตลิ่ง 2.8 ม." ในภาพสูงเท่าที่เกิดจริงเมื่อเทียบกับบ้าน — ไม่ขยายให้ดูน่ากลัวเกินจริง

export const SCENE = {
  width: 1600,
  height: 900,
  /** y ของระดับตลิ่ง (ขอบบนกำแพงคลอง) */
  bankY: 520,
  /** พิกเซลต่อความสูงจริง 1 เมตร */
  pxPerM: 36,
  /** ขอบบนสุดที่ผิวน้ำวาดได้ */
  topY: 40,
} as const;

/** ระดับน้ำ (ม.รทก.) → y ในฉาก · ค่าเพี้ยน (NaN/null) วาดที่ก้นภาพ (ไม่โชว์ว่าน้ำสูงจากข้อมูลที่เชื่อไม่ได้) */
export function mslToSceneY(levelMsl: number | null, bankMsl: number): number {
  if (levelMsl === null || !Number.isFinite(levelMsl) || !Number.isFinite(bankMsl)) return SCENE.height;
  const y = SCENE.bankY - (levelMsl - bankMsl) * SCENE.pxPerM;
  return Math.min(SCENE.height, Math.max(SCENE.topY, y));
}

/** เส้นคลื่นปิดรูป (ยาว 2 เท่าความกว้างฉาก เพื่อเลื่อนวนได้ไม่สะดุด) — ผิวน้ำอยู่ที่ y = 0 ของกลุ่ม */
export function wavePath(amplitude: number, wavelength: number, depth: number, width = SCENE.width * 2): string {
  const half = wavelength / 2;
  let d = `M0 0`;
  for (let x = 0; x < width; x += wavelength) {
    d += ` Q${x + half / 2} ${-amplitude} ${x + half} 0 Q${x + half * 1.5} ${amplitude} ${x + wavelength} 0`;
  }
  return `${d} L${width} ${depth} L0 ${depth} Z`;
}
