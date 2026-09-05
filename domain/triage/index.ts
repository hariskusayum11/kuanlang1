/** รหัสภายในยังคง P1/P2/P3 เพื่อเข้ากับฐานข้อมูล แต่ UI ต้องแสดงคำไทย */
export type TriageCode = "P1" | "P2" | "P3";

const PRIORITY: Record<TriageCode, number> = { P1: 3, P2: 2, P3: 1 };

export const TRIAGE_LABEL: Record<TriageCode, string> = {
  P1: "วิกฤต",
  P2: "เร่งด่วน",
  P3: "เฝ้าระวัง",
};

export const TRIAGE_EXAMPLE: Record<TriageCode, string> = {
  P1: "เช่น ผู้ป่วยติดเตียง หรือผู้ป่วยฟอกไต",
  P2: "เช่น ผู้สูงอายุที่ต้องมีผู้ดูแล หญิงตั้งครรภ์ หรือผู้ต้องกินยาประจำ",
  P3: "เช่น เด็กต่ำกว่า 5 ปี หรือกลุ่มอื่นที่ควรเฝ้าระวัง",
};

/** เลือกระดับที่เร่งด่วนที่สุด เมื่อบุคคลหนึ่งมีหลายลักษณะความเปราะบาง */
export function highestTriage(levels: Array<TriageCode | null | undefined>): TriageCode | null {
  let selected: TriageCode | null = null;
  for (const level of levels) {
    if (!level) continue;
    if (!selected || PRIORITY[level] > PRIORITY[selected]) selected = level;
  }
  return selected;
}

/** ระดับที่เกณฑ์แนะนำจากลักษณะความเปราะบาง โดยยังไม่รวมค่าที่ผู้ดูแลปรับตามพื้นที่ */
export function recommendedTriage(
  basePriorities: Array<TriageCode | null | undefined>,
): TriageCode | null {
  return highestTriage(basePriorities);
}

/** ค่าที่บันทึกไว้เป็นระดับใช้งานจริง; ถ้ายังไม่มีจึงคำนวณจากเกณฑ์เป็นค่าเริ่มต้น */
export function effectiveTriage(
  stored: TriageCode | null | undefined,
  basePriorities: Array<TriageCode | null | undefined>,
): TriageCode | null {
  return stored ?? recommendedTriage(basePriorities);
}

/** true เมื่อระดับใช้งานจริงต่ำกว่าระดับที่เกณฑ์แนะนำ */
export function isTriageBelowRecommendation(
  selected: TriageCode,
  recommended: TriageCode | null | undefined,
): boolean {
  return Boolean(recommended && PRIORITY[selected] < PRIORITY[recommended]);
}

export function triageLabel(level: TriageCode | null | undefined): string {
  return level ? TRIAGE_LABEL[level] : "ยังไม่ประเมิน";
}
