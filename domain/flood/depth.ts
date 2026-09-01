/** รวมค่าระดับน้ำจากช่องเมตรและเซนติเมตรบนแบบสอบถามเป็นเซนติเมตร */
export function calculateFloodDepthCm(
  meters: number | null | undefined,
  centimeters: number | null | undefined,
): number | null {
  if (meters == null && centimeters == null) return null;
  return (meters ?? 0) * 100 + (centimeters ?? 0);
}

/** แปลงเซนติเมตรเป็นเมตรสำหรับหน้าสรุป โดยคงทศนิยมไม่เกิน 2 ตำแหน่ง */
export function floodDepthMeters(centimeters: number | null | undefined): number | null {
  if (centimeters == null) return null;
  return Math.round((centimeters / 100) * 100) / 100;
}
