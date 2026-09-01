import { describe, expect, it } from "vitest";
import { fetchQuestionnaireAnalytics } from "../../lib/dashboard/questionnaire-analytics";

describe("Integration: questionnaire analytics", () => {
  it("อ่านสถิติรวมและรายการกราฟจาก Prisma ได้โดยไม่แตะ PII", async () => {
    const result = await fetchQuestionnaireAnalytics(
      { isGlobalScope: true, communityIds: [] },
      { status: "VERIFIED" },
    );

    expect(result.summary.households).toBeGreaterThanOrEqual(0);
    expect(result.summary.people).toBeGreaterThanOrEqual(0);
    expect(Object.values(result.vulnerability.ages).reduce((sum, count) => sum + count, 0))
      .toBe(result.summary.vulnerablePeople);
    expect(result.vulnerability.types).toEqual(expect.any(Array));
    expect(result.housing.rentedHouseholds).toBeGreaterThanOrEqual(0);
    expect(result.housing.ownershipTypes).toEqual(expect.any(Array));
    expect(result.housing.buildingTypes).toEqual(expect.any(Array));
    expect(result.triage).toEqual(expect.objectContaining({ P1: expect.any(Number), P2: expect.any(Number), P3: expect.any(Number) }));
    expect(Array.isArray(result.assistance)).toBe(true);
    expect(Array.isArray(result.participation.volunteerSkills)).toBe(true);
    expect(result.quality.missingCoordinates).toBeGreaterThanOrEqual(0);
  });
});
