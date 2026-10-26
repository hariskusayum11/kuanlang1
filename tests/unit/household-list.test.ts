import { describe, expect, it } from "vitest";
import { UserRoleEnum } from "@prisma/client";
import { PERMISSIONS } from "../../lib/authz/permissions";
import type { AuthorizationContext } from "../../lib/authz/types";
import {
  buildHouseholdsCsv,
  buildVerifiedWhere,
  canViewHouseholds,
  type HouseholdListRow,
} from "../../lib/household/list";

function ctx(overrides: Partial<AuthorizationContext> = {}): AuthorizationContext {
  return {
    userId: "u1",
    name: "เจ้าหน้าที่",
    email: "a@b.c",
    roles: [UserRoleEnum.OFFICER],
    permissions: [PERMISSIONS.HOUSEHOLD_VIEW],
    isGlobalScope: true,
    isProtectedAccount: false,
    communityIds: [],
    ...overrides,
  };
}

describe("canViewHouseholds", () => {
  it("มี household.view → true, ไม่มี → false", () => {
    expect(canViewHouseholds(ctx())).toBe(true);
    expect(canViewHouseholds(ctx({ permissions: [PERMISSIONS.SURVEY_ENTRY] }))).toBe(false);
  });
});

describe("buildVerifiedWhere", () => {
  it("แสดงเฉพาะ VERIFIED + ไม่ถูกลบ + ไม่ใช่ใบสงสัยซ้ำ", () => {
    const where = buildVerifiedWhere(ctx(), {});
    expect(where).toMatchObject({
      deletedAt: null,
      hasDuplicateFlag: false,
      sheet: { status: "VERIFIED" },
    });
  });

  it("global scope → ไม่กรอง communityId ทิ้ง (เห็นทุกชุมชน)", () => {
    const where = buildVerifiedWhere(ctx(), {});
    expect(where).not.toBeNull();
    // ไม่มีเงื่อนไข communityId scope เมื่อ global (นอกจากผู้ใช้กรองเอง)
    expect((where as Record<string, unknown>).communityId).toBeUndefined();
  });

  it("scoped user + scope ว่าง → null (ไม่มีสิทธิ์เห็นใด — ห้าม fallback ทั้งระบบ)", () => {
    expect(buildVerifiedWhere(ctx({ isGlobalScope: false, communityIds: [] }), {})).toBeNull();
  });

  it("scoped user มีชุมชน → กรองด้วย communityId in [...]", () => {
    const where = buildVerifiedWhere(
      ctx({ isGlobalScope: false, communityIds: ["c1", "c2"] }),
      {},
    );
    expect(where).toMatchObject({ AND: [{ communityId: { in: ["c1", "c2"] } }] });
  });

  it("ตัวกรอง community/tambon ถูกนำไปใส่ใน where", () => {
    const where = buildVerifiedWhere(ctx(), { communityId: "cX", tambonId: "tY" });
    expect(where).toMatchObject({ AND: [{}, { communityId: "cX" }], tambonId: "tY" });
  });

  it("ตัวกรองชุมชนจาก URL เขียนทับขอบเขตไม่ได้ — ต้องผ่านทั้งสองเงื่อนไข (docs/43)", () => {
    const where = buildVerifiedWhere(
      ctx({ isGlobalScope: false, communityIds: ["c1"] }),
      { communityId: "c2" },
    );
    expect(where).toMatchObject({ AND: [{ communityId: { in: ["c1"] } }, { communityId: "c2" }] });
    expect(where).not.toHaveProperty("communityId");
  });

  it("ค้นหา → OR ทั้งรหัสใบและบ้านเลขที่ (ไม่ค้นในฟิลด์เข้ารหัส)", () => {
    const where = buildVerifiedWhere(ctx(), { search: "SK-000123" }) as Record<
      string,
      unknown
    >;
    expect(where.OR).toEqual([
      { sheet: { sheetNo: { contains: "SK-000123", mode: "insensitive" } } },
      { houseNo: { contains: "SK-000123", mode: "insensitive" } },
    ]);
  });

  it("ค้นหาเว้นวรรคล้วน → ไม่เพิ่ม OR", () => {
    const where = buildVerifiedWhere(ctx(), { search: "   " }) as Record<string, unknown>;
    expect(where.OR).toBeUndefined();
  });
});

describe("buildHouseholdsCsv", () => {
  const row: HouseholdListRow = {
    householdId: "h1",
    sheetNo: "SK-000123",
    communityName: "ท่าเคียน",
    tambonName: "ควนลัง",
    houseNo: "45/2",
    mooNo: 3,
    soi: "1",
    road: "กาญจนวนิช",
    memberCount: 4,
    vulnerableCount: 1,
    illegibleCount: 0,
    blankCount: 2,
    enteredByName: "สมชาย",
    enteredAt: new Date("2026-08-01T03:00:00Z"),
    verifiedByName: "สมหญิง",
    verifiedAt: new Date("2026-08-02T03:00:00Z"),
  };

  it("บรรทัดแรกเป็นหัวตาราง 15 คอลัมน์", () => {
    const csv = buildHouseholdsCsv([]);
    const header = csv.split("\r\n")[0];
    expect(header.split(",").length).toBe(15);
    expect(header).toContain("รหัสแบบสอบถาม");
    expect(header).toContain("วันที่ตรวจ");
  });

  it("ไม่มีคอลัมน์ PII อ่อนไหว (ชื่อผู้ให้ข้อมูล/เบอร์/พิกัด)", () => {
    const csv = buildHouseholdsCsv([row]);
    expect(csv).not.toContain("เบอร์");
    expect(csv).not.toContain("พิกัด");
    expect(csv).not.toContain("ละติจูด");
  });

  it("แปลงวันที่เป็น YYYY-MM-DD และคง sheetNo/ที่อยู่", () => {
    const line = buildHouseholdsCsv([row]).split("\r\n")[1];
    expect(line).toContain("SK-000123");
    expect(line).toContain("2026-08-01");
    expect(line).toContain("2026-08-02");
  });

  it("escape ค่าที่มี comma/quote ตาม RFC 4180", () => {
    const tricky: HouseholdListRow = {
      ...row,
      road: 'ถนน "ใหญ่", ตอนล่าง',
      verifiedByName: null,
      verifiedAt: null,
    };
    const line = buildHouseholdsCsv([tricky]).split("\r\n")[1];
    expect(line).toContain('"ถนน ""ใหญ่"", ตอนล่าง"');
    // verifiedAt เป็น null → ช่องว่าง ท้ายบรรทัด
    expect(line.endsWith(",")).toBe(true);
  });

  it("ค่า null แสดงเป็นช่องว่าง ไม่ใช่ 'null'", () => {
    const empty: HouseholdListRow = {
      ...row,
      houseNo: null,
      mooNo: null,
      soi: null,
      road: null,
      memberCount: null,
    };
    const line = buildHouseholdsCsv([empty]).split("\r\n")[1];
    expect(line).not.toContain("null");
  });
});
