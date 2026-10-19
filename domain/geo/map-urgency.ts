// ความเร่งด่วนของหมุดบ้านบนแผนที่ (Owner Decision 2026-10-19)
// Pure Function — เลือก "ระดับที่เร่งด่วนที่สุด" ของบ้าน/กลุ่มบ้านในพิกัดเดียวกัน
//
// เจ้าของระบบไม่ต้องการป้าย P1/P2/P3 บนหมุด ("ดูไม่เข้าใจ") จึงสื่อด้วยสี + คำไทยในคำอธิบายสัญลักษณ์
// คลาสสีอยู่ใน globals.css (.map-urgency-*) ตามกฎ Token

export type MapUrgency = "critical" | "urgent" | "watch" | "unknown";

export interface TriageTally {
  P1: number;
  P2: number;
  P3: number;
  UNASSESSED: number;
}

export const MAP_URGENCY_LABELS: Record<MapUrgency, string> = {
  critical: "วิกฤต — ช่วยภายใน 30 นาที",
  urgent: "เร่งด่วน — ภายใน 2 ชั่วโมง",
  watch: "เฝ้าระวัง — ภายใน 6 ชั่วโมง",
  unknown: "ยังไม่ประเมินความเร่งด่วน",
};

/** ลำดับแสดงในคำอธิบายสัญลักษณ์ — เร่งด่วนสุดก่อน */
export const MAP_URGENCY_ORDER: readonly MapUrgency[] = ["critical", "urgent", "watch", "unknown"];

/** ระดับเร่งด่วนสูงสุดจากผลรวมหลายบ้าน · ไม่มีคนเปราะบางเลย → null (ไม่ต้องวาดหมุดเปราะบาง) */
export function highestUrgency(tallies: readonly TriageTally[]): MapUrgency | null {
  const sum = tallies.reduce(
    (acc, t) => ({
      P1: acc.P1 + t.P1,
      P2: acc.P2 + t.P2,
      P3: acc.P3 + t.P3,
      UNASSESSED: acc.UNASSESSED + t.UNASSESSED,
    }),
    { P1: 0, P2: 0, P3: 0, UNASSESSED: 0 },
  );
  if (sum.P1 > 0) return "critical";
  if (sum.P2 > 0) return "urgent";
  if (sum.P3 > 0) return "watch";
  if (sum.UNASSESSED > 0) return "unknown";
  return null;
}
