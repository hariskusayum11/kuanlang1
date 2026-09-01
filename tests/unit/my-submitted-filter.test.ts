import { describe, expect, it } from "vitest";
import { buildMySubmittedWhere } from "../../lib/entry/claim";

describe("buildMySubmittedWhere", () => {
  it("บังคับเจ้าของใบและไม่รวมใบที่ถูกลบเสมอ", () => {
    expect(buildMySubmittedWhere("user-1")).toMatchObject({
      enteredById: "user-1",
      deletedAt: null,
      sheet: {},
    });
  });

  it("ค้นหารหัสใบหรือบ้านเลขที่ โดยยังคงตัวกรองชุมชนและสถานะ", () => {
    const where = buildMySubmittedWhere("user-1", {
      query: "SK-001",
      communityId: "community-1",
      status: "VERIFIED",
    });
    expect(where).toMatchObject({
      enteredById: "user-1",
      communityId: "community-1",
      sheet: { status: "VERIFIED" },
      OR: [
        { houseNo: { contains: "SK-001", mode: "insensitive" } },
        { sheet: { sheetNo: { contains: "SK-001", mode: "insensitive" } } },
      ],
    });
  });

  it("แยกกำลังแก้ไขออกจากรอตรวจ และสร้างช่วงวันที่แบบไม่รวมต้นวันถัดไป", () => {
    expect(buildMySubmittedWhere("u", { status: "EDITING" })).toMatchObject({
      sheet: { status: "LOCKED" },
    });
    expect(buildMySubmittedWhere("u", { status: "PENDING" })).toMatchObject({
      sheet: { status: { notIn: ["VERIFIED", "LOCKED"] } },
    });
    const where = buildMySubmittedWhere("u", {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-03",
    });
    const enteredAt = where.enteredAt as { gte: Date; lt: Date };
    expect(enteredAt.gte.toISOString()).toBe("2026-07-31T17:00:00.000Z");
    expect(enteredAt.lt.toISOString()).toBe("2026-08-03T17:00:00.000Z");
  });
});
