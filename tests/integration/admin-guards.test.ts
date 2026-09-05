import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  AuditAction,
  BatchStatus,
  PrismaClient,
  SheetStatus,
  UserRoleEnum,
} from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import { ALL_PERMISSIONS, PERMISSIONS } from "../../lib/authz/permissions";
import type { AuthorizationContext } from "../../lib/authz/types";
import { decryptText, encryptText } from "../../lib/crypto/encryption";
import { CURRENT_KEY_VERSION, getKeyring } from "../../lib/crypto/keys";
import { setUserRoles } from "../../lib/admin/users";
import { applyHouseholdEdits } from "../../lib/verification/edit";
import { loadHouseholdForReview } from "../../lib/verification/review";
import { restoreHousehold, softDeleteHousehold } from "../../lib/household/admin-soft-delete";
import { verifyHousehold } from "../../lib/verification/review";
import { fetchCommunityCoverage } from "../../lib/dashboard/get-coverage";
import { applyReportQuickEdit } from "../../lib/report/quick-edit";

// Integration — Guard ของ ADMIN (Owner Decision 2026-07-31)
// ---------------------------------------------------------------------------
// ADMIN = Full System Administrator (ALL_PERMISSIONS + Global Scope)
// สิทธิ์ที่กว้างที่สุดในระบบ จึงต้องมีเทสต์ล็อกไว้ว่า **กฎแยกหน้าที่ยังบังคับกับ ADMIN**
// ไม่ใช่ให้สิทธิ์กว้างแล้วกฎ Data Integrity หลุดตามไปด้วย
//
// รันเฉพาะ local dev DB · fixtures prefix test-adminguard- / TAG* ลบทิ้งใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  admin: "test-adminguard-a@test.invalid",
  admin2: "test-adminguard-b@test.invalid",
  soleAdmin: "test-adminguard-sole@test.invalid",
} as const;
const COMMUNITY_CODE = "TAG1";
const BATCH_CODE = "BATCH-TAG-001";

async function cleanup() {
  const community = await prisma.community.findUnique({
    where: { code: COMMUNITY_CODE },
    select: { id: true },
  });
  if (community) {
    const households = await prisma.household.findMany({
      where: { communityId: community.id },
      select: { id: true },
    });
    const hids = households.map((h) => h.id);
    if (hids.length > 0) {
      await prisma.householdVersion.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.assistanceNeed.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.volunteerInterest.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.floodRiskProfile.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.vulnerablePerson.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.household.deleteMany({ where: { id: { in: hids } } });
    }
  }
  const batch = await prisma.paperBatch.findUnique({ where: { code: BATCH_CODE } });
  if (batch) {
    await prisma.paperSheet.deleteMany({ where: { batchId: batch.id } });
    await prisma.paperBatch.delete({ where: { id: batch.id } });
  }
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  if (users.length > 0) {
    const uids = users.map((u) => u.id);
    await prisma.auditLog.deleteMany({ where: { userId: { in: uids } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: COMMUNITY_CODE } });
}

describe.skipIf(!isLocalDevDb)("Integration: Guard ของ ADMIN (Full System Administrator)", () => {
  let ctxAdmin: AuthorizationContext;
  let adminId = "";
  let admin2Id = "";
  let soleAdminId = "";
  let hhByAdmin = ""; // ใบที่ ADMIN คีย์เอง
  let vulnerablePersonId = "";
  let seededCommunityCount = 0;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    seededCommunityCount = await prisma.community.count({ where: { deletedAt: null } });

    const mkAdmin = async (email: string) => {
      const u = await prisma.user.create({
        data: { email, name: `AdminGuard ${email}` },
      });
      await prisma.userRole.create({
        data: { userId: u.id, role: UserRoleEnum.ADMIN, isActive: true },
      });
      return u;
    };

    const admin = await mkAdmin(EMAILS.admin);
    const admin2 = await mkAdmin(EMAILS.admin2);
    const soleAdmin = await mkAdmin(EMAILS.soleAdmin);
    adminId = admin.id;
    admin2Id = admin2.id;
    soleAdminId = soleAdmin.id;

    ctxAdmin = await loadContextOrThrow({
      id: admin.id,
      name: admin.name,
      email: admin.email,
    });

    // ใบแบบสอบถามที่ "ADMIN คีย์เอง" — ใช้ทดสอบว่า ADMIN ก็ห้ามตรวจงานตัวเอง
    const community = await prisma.community.create({
      data: { code: COMMUNITY_CODE, nameTh: "ชุมชนทดสอบ Guard แอดมิน" },
    });
    const batch = await prisma.paperBatch.create({
      data: {
        code: BATCH_CODE,
        communityId: community.id,
        expectedCount: 1,
        receivedAt: new Date(),
        receivedById: admin.id,
        status: BatchStatus.IN_PROGRESS,
      },
    });
    const sheet = await prisma.paperSheet.create({
      data: {
        communityId: community.id,
        batchId: batch.id,
        sheetNo: "TAG-930001",
        sequence: 1,
        status: SheetStatus.ENTERED_1,
      },
    });
    const keyring = getKeyring();
    const household = await prisma.household.create({
      data: {
        sheetId: sheet.id,
        communityId: community.id,
        enteredById: admin.id, // ← ADMIN เป็นผู้คีย์
        respondentFirstName: encryptText("สมชาย", keyring, CURRENT_KEY_VERSION),
        respondentLastName: encryptText("ทดสอบ", keyring, CURRENT_KEY_VERSION),
        houseNo: "1/1",
        hasVulnerable: false,
      },
    });
    hhByAdmin = household.id;
    const vulnerablePerson = await prisma.vulnerablePerson.create({
      data: { householdId: household.id, seq: 1, triageLevel: "P1" },
    });
    vulnerablePersonId = vulnerablePerson.id;
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // --- 1) ADMIN = Full System Administrator ---------------------------------

  it("1) ADMIN ได้ ALL_PERMISSIONS ครบทุกข้อ (ห้ามลดสิทธิ์)", async () => {
    expect([...ctxAdmin.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
    // สุ่มตรวจสิทธิ์ที่ครอบคลุมทุกโมดูลตามคำตัดสิน
    for (const p of [
      PERMISSIONS.USER_MANAGE,
      PERMISSIONS.COMMUNITY_MANAGE,
      PERMISSIONS.SURVEY_ENTRY,
      PERMISSIONS.VERIFICATION_VIEW,
      PERMISSIONS.DASHBOARD_VIEW,
      PERMISSIONS.REPORT_VIEW,
    ]) {
      expect(ctxAdmin.permissions).toContain(p);
    }
  });

  it("2) ADMIN เป็น Global Scope และเห็นทุกชุมชนโดยไม่ต้องผูก UserCommunityScope", async () => {
    expect(ctxAdmin.isGlobalScope).toBe(true);
    expect(ctxAdmin.communityIds).toEqual([]); // ไม่ได้ผูกชุมชนใดเลย

    const cov = await fetchCommunityCoverage({
      isGlobalScope: ctxAdmin.isGlobalScope,
      communityIds: ctxAdmin.communityIds,
    });
    // +1 = ชุมชน fixture ที่สร้างใน beforeAll
    expect(cov.rows.length).toBe(seededCommunityCount + 1);
  });

  it("3) ธง hasGlobalCommunityScope = false ไม่ลดสิทธิ์ Global ของ ADMIN", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(before.hasGlobalCommunityScope).toBe(false); // ค่าเริ่มต้นของคอลัมน์
    // ADMIN เป็น global จาก Role อยู่แล้ว — ธงรายบัญชีเป็นแค่ "ทางเพิ่ม" ไม่ใช่ "ทางลด"
    expect(ctxAdmin.isGlobalScope).toBe(true);
  });

  // --- 2) Separation of Duties: ADMIN ห้ามยืนยันงานตัวเอง แต่แก้ไขเพื่อดูแลระบบได้ ---

  it("4) ADMIN ที่คีย์ใบเอง ยืนยันใบนั้นไม่ได้ → SELF_VERIFY", async () => {
    const result = await verifyHousehold(ctxAdmin, hhByAdmin);
    expect(result).toEqual({ ok: false, reason: "SELF_VERIFY" });

    // ต้องไม่ถูกยืนยันจริงในฐานข้อมูล
    const after = await prisma.household.findUniqueOrThrow({
      where: { id: hhByAdmin },
      select: { verifiedById: true, verifiedAt: true },
    });
    expect(after.verifiedById).toBeNull();
    expect(after.verifiedAt).toBeNull();
  });

  it("5) ADMIN ที่คีย์ใบเองแก้ได้ แต่ยังยืนยันใบตัวเองไม่ได้", async () => {
    const result = await applyHouseholdEdits(ctxAdmin, hhByAdmin, { houseNo: "99/99" });
    expect(result).toEqual({ ok: true, changedCount: 1 });

    const after = await prisma.household.findUniqueOrThrow({
      where: { id: hhByAdmin },
      select: { houseNo: true },
    });
    expect(after.houseNo).toBe("99/99");
  });

  it("6) ADMIN เปิดดูใบที่ถูกลบแบบ read-only และกู้คืนได้", async () => {
    expect((await softDeleteHousehold(ctxAdmin, hhByAdmin)).ok).toBe(true);
    expect(await loadHouseholdForReview(ctxAdmin, hhByAdmin)).toBeNull();

    const deleted = await loadHouseholdForReview(ctxAdmin, hhByAdmin, { includeDeleted: true });
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect(deleted?.canConfirm).toBe(false);

    expect((await restoreHousehold(ctxAdmin, hhByAdmin)).ok).toBe(true);
    expect((await loadHouseholdForReview(ctxAdmin, hhByAdmin))?.deletedAt).toBeNull();
  });

  it("ADMIN แก้ระดับเร่งด่วน บ้านพักพิง และอาสาสมัครจากรายงานได้", async () => {
    const skill = await prisma.volunteerSkillType.findFirstOrThrow({ where: { isActive: true } });

    expect((await applyReportQuickEdit(ctxAdmin, { kind: "triage", recordId: vulnerablePersonId, value: "P2" })).ok).toBe(true);
    expect((await applyReportQuickEdit(ctxAdmin, { kind: "host-house", recordId: hhByAdmin, value: true })).ok).toBe(true);
    expect((await applyReportQuickEdit(ctxAdmin, { kind: "survival-kit", recordId: hhByAdmin, value: false })).ok).toBe(true);
    expect((await applyReportQuickEdit(ctxAdmin, {
      kind: "volunteer",
      recordId: hhByAdmin,
      state: "INTERESTED",
      skillIds: [skill.id],
    })).ok).toBe(true);

    const [person, household] = await Promise.all([
      prisma.vulnerablePerson.findUniqueOrThrow({ where: { id: vulnerablePersonId } }),
      prisma.household.findUniqueOrThrow({
        where: { id: hhByAdmin },
        include: { floodRiskProfile: true, volunteerInterests: true },
      }),
    ]);
    expect(person.triageLevel).toBe("P2");
    expect(household.floodRiskProfile?.canBeHostHouse).toBe(true);
    expect(household.floodRiskProfile?.hasSurvivalKit).toBe(false);
    expect(household.volunteerNotAvailable).toBe(false);
    expect(household.volunteerInterests.map((item) => item.volunteerTypeId)).toEqual([skill.id]);
  });

  it("ADMIN แก้รายละเอียดและยกเลิกความต้องการช่วยเหลือจากรายงานได้", async () => {
    const type = await prisma.assistanceNeedType.findFirstOrThrow({
      where: { isActive: true, requiresCount: true },
      orderBy: { sortOrder: "asc" },
    });
    const keyring = getKeyring();
    const need = await prisma.assistanceNeed.create({
      data: {
        householdId: hhByAdmin,
        needTypeId: type.id,
        personCount: 1,
        detail: encryptText("ข้อมูลเดิม", keyring, CURRENT_KEY_VERSION),
      },
    });

    expect((await applyReportQuickEdit(ctxAdmin, {
      kind: "assistance",
      recordId: hhByAdmin,
      needId: need.id,
      active: true,
      typeId: type.id,
      personCount: 3,
      detail: "ข้อมูลตรวจสอบใหม่",
    })).ok).toBe(true);
    const updated = await prisma.assistanceNeed.findUniqueOrThrow({ where: { id: need.id } });
    expect(updated.personCount).toBe(3);
    expect(decryptText(updated.detail!, keyring)).toBe("ข้อมูลตรวจสอบใหม่");
    expect((await prisma.household.findUniqueOrThrow({ where: { id: hhByAdmin } })).assistanceTotalPersonCount).toBe(3);

    expect((await applyReportQuickEdit(ctxAdmin, {
      kind: "assistance",
      recordId: hhByAdmin,
      needId: need.id,
      active: false,
      personCount: null,
      detail: "",
    })).ok).toBe(true);
    expect(await prisma.assistanceNeed.findUnique({ where: { id: need.id } })).toBeNull();
    expect((await prisma.household.findUniqueOrThrow({ where: { id: hhByAdmin } })).assistanceTotalPersonCount).toBeNull();
  });

  it("ผู้ไม่มี report.quick-edit แก้ค่าจากรายงานไม่ได้", async () => {
    const result = await applyReportQuickEdit(
      { ...ctxAdmin, permissions: [PERMISSIONS.REPORT_VIEW] },
      { kind: "host-house", recordId: hhByAdmin, value: false },
    );
    expect(result).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect((await prisma.floodRiskProfile.findUnique({ where: { householdId: hhByAdmin } }))?.canBeHostHouse).toBe(true);
  });

  it("ADMIN ลดระดับใช้งานจริงต่ำกว่าคำแนะนำได้ และ Audit ยังเก็บคำแนะนำเดิม", async () => {
    // ผู้ป่วยที่เกณฑ์แนะนำ P1 สามารถปรับเป็น P3 ตามข้อเท็จจริงในพื้นที่ได้
    const p1Type = await prisma.vulnerabilityType.findFirst({ where: { basePriority: "P1" }, select: { id: true } });
    if (!p1Type) return; // DB ไม่ได้ seed master P1 — ข้าม
    const person = await prisma.vulnerablePerson.create({
      data: { householdId: hhByAdmin, seq: 99, triageLevel: "P1" },
    });
    await prisma.personVulnerability.create({
      data: { personId: person.id, vulnerabilityTypeId: p1Type.id },
    });
    try {
      expect((await applyReportQuickEdit(ctxAdmin, { kind: "triage", recordId: person.id, value: "P3" })).ok).toBe(true);
      expect((await prisma.vulnerablePerson.findUniqueOrThrow({ where: { id: person.id } })).triageLevel).toBe("P3");
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: "VulnerablePerson", entityId: person.id, reason: "report-quick-edit:triage" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit?.changes).toMatchObject({ recommendedLevel: "P1", belowRecommendation: true });
    } finally {
      await prisma.vulnerablePerson.delete({ where: { id: person.id } }); // cascade ลบ personVulnerability
    }
  });

  // --- 3) Guard ของการจัดการบัญชี ------------------------------------------

  it("7) ADMIN ถอดสิทธิ์ ADMIN ของตัวเองไม่ได้ → SELF_ADMIN_REMOVAL", async () => {
    const result = await setUserRoles(ctxAdmin, adminId, [UserRoleEnum.OFFICER]);
    expect(result).toEqual({ ok: false, reason: "SELF_ADMIN_REMOVAL" });

    const roles = await prisma.userRole.findMany({
      where: { userId: adminId, isActive: true },
      select: { role: true },
    });
    expect(roles.map((r) => r.role)).toContain(UserRoleEnum.ADMIN);
  });

  it("7) ถอด ADMIN คนสุดท้ายของระบบไม่ได้ → LAST_ADMIN", async () => {
    // ctx สังเคราะห์: มี user.manage แต่ไม่ได้เป็น ADMIN เอง
    // (กันไว้เผื่ออนาคตมีบทบาทอื่นได้รับ user.manage — ปัจจุบันมีแค่ ADMIN)
    const managerCtx: AuthorizationContext = {
      ...ctxAdmin,
      userId: "synthetic-manager-not-an-admin",
      permissions: [PERMISSIONS.USER_MANAGE],
    };

    // ปิดบัญชี ADMIN อื่นทั้งหมดชั่วคราว เหลือ soleAdmin เป็นคนสุดท้ายจริง
    const otherAdmins = await prisma.userRole.findMany({
      where: { role: UserRoleEnum.ADMIN, isActive: true, userId: { not: soleAdminId } },
      select: { userId: true },
    });
    const otherIds = otherAdmins.map((r) => r.userId);
    await prisma.user.updateMany({
      where: { id: { in: otherIds } },
      data: { isActive: false },
    });

    try {
      const result = await setUserRoles(managerCtx, soleAdminId, [UserRoleEnum.OFFICER]);
      expect(result).toEqual({ ok: false, reason: "LAST_ADMIN" });

      const roles = await prisma.userRole.findMany({
        where: { userId: soleAdminId, isActive: true },
        select: { role: true },
      });
      expect(roles.map((r) => r.role)).toContain(UserRoleEnum.ADMIN);
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: otherIds } },
        data: { isActive: true },
      });
    }
  });

  it("8) ผู้ไม่มี user.manage แก้บทบาทคนอื่นไม่ได้ → NOT_ALLOWED (ตรวจฝั่ง server)", async () => {
    const powerless: AuthorizationContext = {
      ...ctxAdmin,
      userId: "synthetic-no-permission",
      permissions: [],
    };
    const result = await setUserRoles(powerless, admin2Id, [UserRoleEnum.OFFICER]);
    expect(result).toEqual({ ok: false, reason: "NOT_ALLOWED" });

    const roles = await prisma.userRole.findMany({
      where: { userId: admin2Id, isActive: true },
      select: { role: true },
    });
    expect(roles.map((r) => r.role)).toContain(UserRoleEnum.ADMIN);
  });

  // --- 4) Audit Log ---------------------------------------------------------

  it("9) การเปลี่ยนบทบาทเขียน Audit Log ค่าก่อน/หลัง", async () => {
    const result = await setUserRoles(ctxAdmin, admin2Id, [
      UserRoleEnum.ADMIN,
      UserRoleEnum.OFFICER,
    ]);
    expect(result.ok).toBe(true);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "UserRole", entityId: admin2Id },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log?.userId).toBe(adminId);
    expect(log?.action).toBe(AuditAction.UPDATE);
    expect(log?.changes).toMatchObject({
      before: [UserRoleEnum.ADMIN],
      after: [UserRoleEnum.ADMIN, UserRoleEnum.OFFICER].sort(),
    });
  });

  it("10) Audit Log ของบทบาทต้องไม่มี PII (ชื่อ/อีเมล/เบอร์โทร)", async () => {
    const log = await prisma.auditLog.findFirst({
      where: { entityType: "UserRole", entityId: admin2Id },
      orderBy: { createdAt: "desc" },
    });
    const serialized = JSON.stringify(log?.changes ?? {});
    expect(serialized).not.toContain("@test.invalid");
    expect(serialized).not.toContain("AdminGuard");
  });
});
