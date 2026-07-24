import { describe, expect, it } from "vitest";
import {
  buildCommunityCoverage,
  summarizeCoverage,
  type CommunityCoverageRaw,
} from "../../lib/dashboard/coverage";

const raw = (over: Partial<CommunityCoverageRaw>): CommunityCoverageRaw => ({
  communityId: "c1",
  code: "C1",
  nameTh: "ชุมชน 1",
  totalHouseholds: 100,
  targetCoveragePercent: 60,
  surveyed: 0,
  verified: 0,
  ...over,
});

describe("buildCommunityCoverage — Survey/Verified Coverage (reuse calculateCoverage)", () => {
  it("total = NULL → ทั้งคู่ NOT_CALCULABLE (ไม่ใช่ 0%)", () => {
    const r = buildCommunityCoverage(raw({ totalHouseholds: null, surveyed: 50, verified: 30 }));
    expect(r.surveyCoverage.kind).toBe("NOT_CALCULABLE");
    expect(r.verifiedCoverage.kind).toBe("NOT_CALCULABLE");
  });

  it("Verified 61/100 → ผ่านเป้า (strict >60) · Survey แยกคำนวณต่างหาก", () => {
    const r = buildCommunityCoverage(raw({ surveyed: 80, verified: 61 }));
    expect(r.verifiedCoverage).toEqual({ kind: "CALCULATED", percent: 61, meetsTarget: true });
    expect(r.surveyCoverage).toEqual({ kind: "CALCULATED", percent: 80, meetsTarget: true });
  });

  it("Verified 60/100 พอดี → ไม่ผ่าน (strict >)", () => {
    const r = buildCommunityCoverage(raw({ verified: 60 }));
    expect(r.verifiedCoverage).toEqual({ kind: "CALCULATED", percent: 60, meetsTarget: false });
  });
});

describe("summarizeCoverage — สรุปข้ามชุมชน", () => {
  it("รวมเฉพาะชุมชนที่ทราบ denominator + นับชุมชนที่ผ่านเป้า", () => {
    const rows = [
      buildCommunityCoverage(raw({ communityId: "a", totalHouseholds: 100, surveyed: 90, verified: 70 })), // ผ่าน
      buildCommunityCoverage(raw({ communityId: "b", totalHouseholds: 200, surveyed: 100, verified: 80 })), // 40% ไม่ผ่าน
      buildCommunityCoverage(raw({ communityId: "c", totalHouseholds: null, surveyed: 20, verified: 10 })), // ไม่ทราบ
    ];
    const s = summarizeCoverage(rows);
    expect(s.communities).toBe(3);
    expect(s.knownCommunities).toBe(2);
    expect(s.surveyed).toBe(210); // นับทุกชุมชน
    expect(s.verified).toBe(160);
    expect(s.totalHouseholdsKnown).toBe(300); // เฉพาะ a+b
    // Verified รวม = (70+80)/300 = 50% → ไม่ผ่านเป้า 60
    expect(s.verifiedCoverage).toEqual({ kind: "CALCULATED", percent: 50, meetsTarget: false });
    expect(s.passedCommunities).toBe(1); // เฉพาะ a
  });

  it("ไม่มีชุมชนที่ทราบ denominator → NOT_CALCULABLE", () => {
    const rows = [buildCommunityCoverage(raw({ totalHouseholds: null, verified: 5 }))];
    const s = summarizeCoverage(rows);
    expect(s.totalHouseholdsKnown).toBe(0);
    expect(s.verifiedCoverage.kind).toBe("NOT_CALCULABLE");
    expect(s.passedCommunities).toBe(0);
  });

  it("รายการว่าง → 0 ทั้งหมด + NOT_CALCULABLE", () => {
    const s = summarizeCoverage([]);
    expect(s).toMatchObject({
      communities: 0,
      knownCommunities: 0,
      surveyed: 0,
      verified: 0,
      totalHouseholdsKnown: 0,
      passedCommunities: 0,
    });
    expect(s.verifiedCoverage.kind).toBe("NOT_CALCULABLE");
  });
});
