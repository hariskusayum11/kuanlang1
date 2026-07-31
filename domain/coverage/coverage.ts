// =============================================================================
// Coverage Model — Pure Functions (คำตัดสินเจ้าของ #1, #2)
// -----------------------------------------------------------------------------
// #1: totalHouseholds "ไม่ทราบ" = NULL เท่านั้น — ห้ามใช้ 0 → คืน NOT_CALCULABLE
//     (ไม่ใช่ "0%" ที่ทำให้ผู้บริหารเข้าใจว่ายังไม่ได้สำรวจเลย)
// #2: เกณฑ์ผ่านใช้ strict `>` (percent > targetCoveragePercent) — 60% พอดี = ไม่ผ่าน
// Pure: ไม่แตะ DB/IO — ทดสอบได้โดยตรง (tests/unit/coverage.test.ts)
// =============================================================================

export interface CoverageInput {
  /// จำนวนที่นับได้ (แบบสอบถามที่ได้รับ / คีย์แล้ว / VERIFIED แล้ว ตามบริบทที่เรียก)
  count: number;
  /// จำนวนครัวเรือนทั้งหมดของชุมชน — NULL = ยังไม่ทราบ (ห้ามใช้ 0)
  totalHouseholds: number | null;
  /// เปอร์เซ็นต์เป้าหมาย (ค่าเริ่มต้น 60)
  targetCoveragePercent: number;
}

export type CoverageResult =
  | { kind: "NOT_CALCULABLE" }
  | { kind: "CALCULATED"; percent: number; meetsTarget: boolean };

export interface ValidationResult {
  ok: boolean;
}

/// ตรวจค่า totalHouseholds ที่ยอมรับได้: NULL (ยังไม่ทราบ) หรือ จำนวนเต็มบวก
/// 0 และค่าติดลบ = ไม่ผ่าน (สอดคล้อง CHECK ck_community_total_households: NULL OR > 0)
export function validateTotalHouseholds(value: number | null): ValidationResult {
  if (value === null) return { ok: true };
  return { ok: Number.isFinite(value) && value > 0 };
}

/// คำนวณ Coverage แบบ NULL-aware ตามคำตัดสิน #1, #2
export function calculateCoverage(input: CoverageInput): CoverageResult {
  const { count, totalHouseholds, targetCoveragePercent } = input;

  // #1: ไม่มี Denominator ที่ใช้ได้ → คำนวณไม่ได้ (กันหารศูนย์ + ห้ามคืน 0%)
  if (totalHouseholds === null || totalHouseholds <= 0) {
    return { kind: "NOT_CALCULABLE" };
  }

  // (count * 100) ก่อนหาร เพื่อให้ผลตรงตามที่คาด (ไม่ clamp — เกิน 100% ได้)
  const percent = (count * 100) / totalHouseholds;

  // #2: strict `>` — เท่าเป้าพอดี = ไม่ผ่าน
  const meetsTarget = percent > targetCoveragePercent;

  return { kind: "CALCULATED", percent, meetsTarget };
}
