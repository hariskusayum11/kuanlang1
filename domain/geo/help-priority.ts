// ลำดับการช่วยเหลือบนแผนที่ภายใน (Owner Decision 2026-10-19 · docs/40) — Pure Function
//
// เรียง: ความเร่งด่วนสูงสุดของบ้าน (วิกฤต → เร่งด่วน → เฝ้าระวัง → ยังไม่ประเมิน → ไม่มีกลุ่มเปราะบาง)
//        → คะแนนความเสี่ยงสัมบูรณ์ (มาก → น้อย) → ความมั่นใจ (มาก → น้อย) → รหัสใบ (คงที่ทุกครั้ง)
// ครัวเรือนที่ไม่มีกลุ่มเปราะบางยังอยู่ในรายการ (ต่อท้ายตามคะแนนความเสี่ยง) — ไม่มีบ้านหายเงียบ

import { MAP_URGENCY_LABELS, type MapUrgency } from "./map-urgency";

/** "none" = บ้านไม่มีกลุ่มเปราะบางที่ยัง active */
export type HelpUrgency = MapUrgency | "none";

export const HELP_URGENCY_ORDER: readonly HelpUrgency[] = ["critical", "urgent", "watch", "unknown", "none"];

/** คำไทยในคำอธิบายสัญลักษณ์/รายการ — ไม่ใช้รหัส P1–P3 (Owner Decision 2026-10-19) */
export const HELP_URGENCY_LABELS: Record<HelpUrgency, string> = {
  ...MAP_URGENCY_LABELS,
  none: "ไม่มีกลุ่มเปราะบาง — เรียงตามความเสี่ยงบ้าน",
};

export const HELP_URGENCY_WORD: Record<HelpUrgency, string> = {
  critical: "วิกฤต",
  urgent: "เร่งด่วน",
  watch: "เฝ้าระวัง",
  unknown: "ยังไม่ประเมิน",
  none: "ไม่มีกลุ่มเปราะบาง",
};

const URGENCY_RANK: Record<HelpUrgency, number> = {
  critical: 4,
  urgent: 3,
  watch: 2,
  unknown: 1,
  none: 0,
};

export interface HelpCandidate {
  urgency: HelpUrgency;
  absoluteScore: number;
  confidence: number;
  sheetNo: string;
}

/** ค่าเพี้ยน (NaN/Infinity) นับเป็น 0 — ไม่ให้บ้านที่ข้อมูลเสียกระโดดขึ้นหัวรายการ */
function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function compareHelpPriority(a: HelpCandidate, b: HelpCandidate): number {
  return (
    URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency] ||
    finite(b.absoluteScore) - finite(a.absoluteScore) ||
    finite(b.confidence) - finite(a.confidence) ||
    a.sheetNo.localeCompare(b.sheetNo)
  );
}

/** คืนสำเนาที่เรียงแล้วพร้อมลำดับ 1..n (ไม่แก้ array เดิม) */
export function rankHelpCases<T extends HelpCandidate>(items: readonly T[]): Array<T & { rank: number }> {
  return [...items].sort(compareHelpPriority).map((item, index) => ({ ...item, rank: index + 1 }));
}
