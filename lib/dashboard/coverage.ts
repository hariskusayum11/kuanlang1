// Dashboard Coverage — pure mapping (reuse domain/coverage calculateCoverage)
// -----------------------------------------------------------------------------
// Survey Coverage = คีย์แล้ว / totalHouseholds · Verified Coverage = VERIFIED / totalHouseholds
// totalHouseholds = NULL → NOT_CALCULABLE (ไม่ใช่ 0%) · ผ่านเป้า strict > (คำตัดสิน #1/#2)
// ไม่นับ soft-deleted / hasDuplicateFlag เป็น Coverage (CLAUDE.md)

import {
  calculateCoverage,
  type CoverageResult,
} from "../../domain/coverage/coverage";

export interface CommunityCoverageRaw {
  communityId: string;
  code: string;
  nameTh: string;
  totalHouseholds: number | null;
  targetCoveragePercent: number;
  /** ครัวเรือนที่คีย์แล้ว (ENTERED_1 ขึ้นไป — ไม่นับ soft-deleted/ซ้ำ) */
  surveyed: number;
  /** ครัวเรือน VERIFIED (ไม่นับ soft-deleted/ซ้ำ) */
  verified: number;
}

export interface CommunityCoverageRow extends CommunityCoverageRaw {
  surveyCoverage: CoverageResult;
  verifiedCoverage: CoverageResult;
}

export function buildCommunityCoverage(raw: CommunityCoverageRaw): CommunityCoverageRow {
  const cov = (count: number) =>
    calculateCoverage({
      count,
      totalHouseholds: raw.totalHouseholds,
      targetCoveragePercent: raw.targetCoveragePercent,
    });
  return { ...raw, surveyCoverage: cov(raw.surveyed), verifiedCoverage: cov(raw.verified) };
}

export interface CoverageSummary {
  communities: number;
  /** ชุมชนที่ทราบจำนวนครัวเรือนทั้งหมด (มี denominator) */
  knownCommunities: number;
  surveyed: number;
  verified: number;
  /** ผลรวม totalHouseholds เฉพาะชุมชนที่ทราบ */
  totalHouseholdsKnown: number;
  /** Verified Coverage รวม (verified/totalHouseholdsKnown) — NOT_CALCULABLE ถ้าไม่มีชุมชนที่ทราบ */
  verifiedCoverage: CoverageResult;
  /** จำนวนชุมชนที่ Verified Coverage ผ่านเป้าของตนเอง (strict >) */
  passedCommunities: number;
}

/** สรุปข้ามชุมชน — Verified Coverage รวมคิดจากเฉพาะชุมชนที่มี denominator (เป้ารวมใช้ 60) */
export function summarizeCoverage(
  rows: CommunityCoverageRow[],
  aggregateTargetPercent = 60,
): CoverageSummary {
  const known = rows.filter((r) => r.totalHouseholds != null && r.totalHouseholds > 0);
  const totalHouseholdsKnown = known.reduce((a, r) => a + (r.totalHouseholds as number), 0);
  const verifiedKnown = known.reduce((a, r) => a + r.verified, 0);
  return {
    communities: rows.length,
    knownCommunities: known.length,
    surveyed: rows.reduce((a, r) => a + r.surveyed, 0),
    verified: rows.reduce((a, r) => a + r.verified, 0),
    totalHouseholdsKnown,
    verifiedCoverage: calculateCoverage({
      count: verifiedKnown,
      totalHouseholds: totalHouseholdsKnown > 0 ? totalHouseholdsKnown : null,
      targetCoveragePercent: aggregateTargetPercent,
    }),
    passedCommunities: rows.filter(
      (r) => r.verifiedCoverage.kind === "CALCULATED" && r.verifiedCoverage.meetsTarget,
    ).length,
  };
}
