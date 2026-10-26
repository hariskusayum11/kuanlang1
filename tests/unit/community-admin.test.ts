import { describe, it, expect } from "vitest";
import { nextReportedSeq, REPORTED_SEQ_START } from "../../domain/vulnerable/reported";
import { activityHouseholdId, describeLeaderActivity } from "../../domain/vulnerable/leader-activity";
import { reportPersonSchema, statusChangeSchema } from "../../lib/vulnerable-status/validation";
import { householdSheetHref } from "../../lib/household/sheet-link";
import { PERMISSIONS } from "../../lib/authz/permissions";

// หัวหน้าชุมชน = แอดมินชุมชน (Owner Decision 2026-10-26 · docs/43)

const CUID = "ckabcdefghijklmnopqrstuvw";
const CUID2 = "ckzyxwvutsrqponmlkjihgfed";

describe("nextReportedSeq", () => {
  it("เริ่มที่ 1001 และไม่ชนแถวกระดาษ", () => {
    expect(REPORTED_SEQ_START).toBe(1001);
    expect(nextReportedSeq([])).toBe(1001);
    expect(nextReportedSeq([1, 2, 3])).toBe(1001);
    expect(nextReportedSeq([1, 1001, 1003])).toBe(1004);
  });
});

describe("reportPersonSchema", () => {
  const base = { householdId: CUID, firstName: "สมศรี", vulnerabilityTypeIds: [CUID2] };
  it("ข้อมูลขั้นต่ำผ่าน", () => {
    expect(reportPersonSchema.safeParse(base).success).toBe(true);
  });
  it("ต้องมีชื่อและลักษณะอย่างน้อย 1 ข้อ", () => {
    expect(reportPersonSchema.safeParse({ ...base, firstName: " " }).success).toBe(false);
    expect(reportPersonSchema.safeParse({ ...base, vulnerabilityTypeIds: [] }).success).toBe(false);
  });
  it("อายุเดือนใช้ได้เฉพาะเด็กอายุ 0 ปี", () => {
    expect(reportPersonSchema.safeParse({ ...base, ageYears: 0, ageMonths: 2 }).success).toBe(true);
    expect(reportPersonSchema.safeParse({ ...base, ageYears: 5, ageMonths: 2 }).success).toBe(false);
    expect(reportPersonSchema.safeParse({ ...base, ageYears: 121 }).success).toBe(false);
  });
  it("เบอร์โทรต้องเป็นตัวเลข", () => {
    expect(reportPersonSchema.safeParse({ ...base, phone: "081-234-5678" }).success).toBe(true);
    expect(reportPersonSchema.safeParse({ ...base, phone: "โทรหาลูก" }).success).toBe(false);
  });
});

describe("statusChangeSchema — ย้ายออกทั้งบ้าน", () => {
  it("ใช้ได้กับ MOVED_OUT เท่านั้น", () => {
    const base = { personId: CUID, eventDate: "2026-10-01", wholeHousehold: true };
    expect(statusChangeSchema.safeParse({ ...base, target: "MOVED_OUT" }).success).toBe(true);
    expect(statusChangeSchema.safeParse({ ...base, target: "DECEASED" }).success).toBe(false);
  });
});

describe("describeLeaderActivity", () => {
  it("แปลงเป็นประโยคไทยไม่มีรหัสดิบ", () => {
    expect(describeLeaderActivity("vulnerable-status-change", { status: { old: "ACTIVE", new: "DECEASED" } }).text)
      .toBe("เปลี่ยนสถานะกลุ่มเปราะบาง 1 คน: ปกติ → เสียชีวิต");
    expect(describeLeaderActivity("vulnerable-household-moved-out", { personCount: 3 }).text).toBe("บันทึกย้ายออกทั้งบ้าน 3 คน");
    expect(describeLeaderActivity("population-update", { totalHouseholds: { old: null, new: 420 } }).text)
      .toBe("แก้จำนวนครัวเรือนทั้งหมด: ยังไม่ทราบ → 420");
  });
  it("หา householdId จาก entity หรือ changes", () => {
    expect(activityHouseholdId("Household", "h1", null)).toBe("h1");
    expect(activityHouseholdId("VulnerablePerson", "p1", { householdId: "h2" })).toBe("h2");
    expect(activityHouseholdId("Community", "c1", {})).toBeNull();
  });
});

describe("householdSheetHref", () => {
  it("ผู้ตรวจไปหน้าตรวจ · ผู้ดูข้อมูลครัวเรือนไปหน้าดูอย่างเดียว · ไม่มีสิทธิ์ไม่มีลิงก์", () => {
    expect(householdSheetHref([PERMISSIONS.VERIFICATION_VIEW, PERMISSIONS.HOUSEHOLD_VIEW], "h")).toBe("/verification/h?mode=view");
    expect(householdSheetHref([PERMISSIONS.HOUSEHOLD_VIEW], "h")).toBe("/households/h");
    expect(householdSheetHref([PERMISSIONS.MAP_VIEW], "h")).toBeNull();
  });
});
