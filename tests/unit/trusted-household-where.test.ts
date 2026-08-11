import { describe, expect, it } from "vitest";
import { buildUsableHouseholdWhere, buildVerifiedMapHouseholdWhere } from "../../lib/household/trusted-where";

describe("trusted household criteria", () => {
  it("รักษา community scope แยกจากตัวกรองที่ผู้ใช้ส่งมา", () => {
    const where = buildUsableHouseholdWhere(
      { status: "ALL", communityId: "outside-scope" },
      ["allowed-community"],
    );
    expect(where.AND).toEqual(expect.arrayContaining([
      { communityId: { in: ["allowed-community"] } },
      { communityId: "outside-scope" },
    ]));
  });

  it("แผนที่บังคับ VERIFIED และไม่รวมเฉพาะใบที่ยืนยันว่าซ้ำจริง", () => {
    const where = buildVerifiedMapHouseholdWhere({});
    expect(where.AND).toEqual(expect.arrayContaining([
      { sheet: { status: "VERIFIED" } },
      { OR: [
        { duplicateResolution: null },
        { duplicateResolution: "NOT_DUPLICATE" },
      ] },
    ]));
  });

  it("วันที่สิ้นสุดรวมทั้งวันด้วยช่วงแบบน้อยกว่าวันถัดไป", () => {
    const where = buildUsableHouseholdWhere({ status: "VERIFIED", dateTo: "2026-08-12" });
    const clauses = where.AND as object[];
    expect(clauses).toEqual(expect.arrayContaining([
      { surveyedAt: { lt: new Date("2026-08-13T00:00:00.000Z") } },
    ]));
  });
});

