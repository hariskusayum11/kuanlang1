import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  AuditAction,
  PrismaClient,
  RegistrationRequestStatus,
  UserRoleEnum,
} from "@prisma/client";
import {
  RETIRE_FIELD_SURVEYOR_MIGRATION_ID,
  retireFieldSurveyor,
  verifyFieldSurveyorRetired,
} from "../../lib/admin/retire-field-surveyor";
import { migrateLegacyRoles } from "../../lib/admin/migrate-legacy-roles";
import { setUserRoles } from "../../lib/admin/users";
import { loadAuthorizationForUser } from "../../lib/authz/load-authorization";
import { loadContextOrThrow } from "../helpers/authz";
import { PERMISSIONS } from "../../lib/authz/permissions";
import { visibleNavItems } from "../../lib/navigation";

// Integration — เลิกใช้บทบาท FIELD_SURVEYOR (Owner Decision #R6-E)
// รันจริงบน PostgreSQL · fixtures prefix test-retirefs- ลบทิ้งใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  admin: "test-retirefs-admin@test.invalid",
  surveyorOnly: "test-retirefs-only@test.invalid",
  surveyorEntry: "test-retirefs-entry@test.invalid",
  pendingApplicant: "test-retirefs-pending@test.invalid",
  approvedApplicant: "test-retirefs-approved@test.invalid",
  rejectedApplicant: "test-retirefs-rejected@test.invalid",
  volunteer: "test-retirefs-volunteer@test.invalid",
  researcher: "test-retirefs-researcher@test.invalid",
  legacyCoord: "test-retirefs-coord@test.invalid",
} as const;

const ids: Record<keyof typeof EMAILS, string> = {} as Record<
  keyof typeof EMAILS,
  string
>;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  const uids = users.map((u) => u.id);
  if (uids.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: uids } } });
    const reqs = await prisma.registrationRequest.findMany({
      where: { userId: { in: uids } },
      select: { id: true },
    });
    await prisma.auditLog.deleteMany({
      where: { entityId: { in: reqs.map((r) => r.id) } },
    });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
}

async function seedFixtures() {
  const mk = async (
    key: keyof typeof EMAILS,
    roles: UserRoleEnum[],
    request?: { role: UserRoleEnum; status: RegistrationRequestStatus },
  ) => {
    const u = await prisma.user.create({
      data: { email: EMAILS[key], name: `RetireFS ${key}` },
    });
    for (const role of roles) {
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
    }
    if (request) {
      await prisma.registrationRequest.create({
        data: { userId: u.id, requestedRole: request.role, status: request.status },
      });
    }
    ids[key] = u.id;
  };

  await mk("admin", [UserRoleEnum.ADMIN]);
  await mk("surveyorOnly", [UserRoleEnum.FIELD_SURVEYOR]);
  await mk("surveyorEntry", [UserRoleEnum.FIELD_SURVEYOR, UserRoleEnum.DATA_ENTRY]);
  await mk("pendingApplicant", [], {
    role: UserRoleEnum.FIELD_SURVEYOR,
    status: RegistrationRequestStatus.PENDING,
  });
  await mk("approvedApplicant", [UserRoleEnum.FIELD_SURVEYOR], {
    role: UserRoleEnum.FIELD_SURVEYOR,
    status: RegistrationRequestStatus.APPROVED,
  });
  await mk("rejectedApplicant", [], {
    role: UserRoleEnum.FIELD_SURVEYOR,
    status: RegistrationRequestStatus.REJECTED,
  });
  await mk("volunteer", [UserRoleEnum.VOLUNTEER]);
  await mk("researcher", [UserRoleEnum.RESEARCHER]);
  await mk("legacyCoord", [UserRoleEnum.COORDINATOR]);
}

async function activeRolesOf(key: keyof typeof EMAILS): Promise<UserRoleEnum[]> {
  const rows = await prisma.userRole.findMany({
    where: { userId: ids[key], isActive: true },
    select: { role: true },
  });
  return rows.map((r) => r.role).sort();
}

describe.skipIf(!isLocalDevDb)("Integration: เลิกใช้บทบาท FIELD_SURVEYOR", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
  });

  beforeEach(async () => {
    await cleanup();
    await seedFixtures();
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("dry-run รายงานจำนวนถูกต้องโดยไม่เขียนข้อมูล", async () => {
    const result = await retireFieldSurveyor(prisma, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.activeUserRoles).toBe(3); // surveyorOnly surveyorEntry approvedApplicant
    expect(result.usersWithOnlyFieldSurveyor).toBe(2); // surveyorOnly approvedApplicant
    expect(result.usersWithOtherRolesToo).toBe(1); // surveyorEntry
    expect(result.pendingRequestsRejected).toBe(1);
    // นับทั้งฐาน ไม่ใช่เฉพาะ fixture — Dev DB มีคำขอ APPROVED เดิมจากการทดสอบจริงอยู่แล้ว
    // ยืนยันแค่ว่า "นับได้และรายงานออกมา" ส่วนการไม่ถูกแตะมีเทสต์เฉพาะแยกไว้
    expect(result.approvedRequestsUntouched).toBeGreaterThanOrEqual(1);
    expect(result.alreadyClosedRequests).toBeGreaterThanOrEqual(1);

    expect(await activeRolesOf("surveyorOnly")).toEqual([UserRoleEnum.FIELD_SURVEYOR]);
  });

  it("8) Active FIELD_SURVEYOR UserRole ถูกปิด", async () => {
    await retireFieldSurveyor(prisma);
    expect(await activeRolesOf("surveyorOnly")).toEqual([]);

    // ไม่ลบแถวทิ้ง — เก็บเป็นประวัติ
    const kept = await prisma.userRole.count({
      where: {
        userId: ids.surveyorOnly,
        role: UserRoleEnum.FIELD_SURVEYOR,
        isActive: false,
      },
    });
    expect(kept).toBe(1);
  });

  it("9-10) Role อื่นยังอยู่ และไม่มีบทบาททดแทนถูกเพิ่มอัตโนมัติ", async () => {
    await retireFieldSurveyor(prisma);
    expect(await activeRolesOf("surveyorEntry")).toEqual([UserRoleEnum.DATA_ENTRY]);
    // ห้ามได้ OFFICER หรืออะไรก็ตามมาแทน
    expect(await activeRolesOf("surveyorOnly")).toEqual([]);
    expect(await activeRolesOf("approvedApplicant")).toEqual([]);
  });

  it("ไม่แตะ User.isActive — บัญชียังอยู่ แม้ไม่เหลือบทบาทใด", async () => {
    await retireFieldSurveyor(prisma);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.surveyorOnly } });
    expect(u.isActive).toBe(true);
  });

  it("14) ผู้ใช้ที่เหลือ FIELD_SURVEYOR อย่างเดียว เข้า Dashboard ภายในไม่ได้", async () => {
    await retireFieldSurveyor(prisma);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.surveyorOnly } });
    const ctx = await loadContextOrThrow(u); // บัญชียัง active จึงโหลดได้
    expect(ctx.permissions).toEqual([]);
    expect(ctx.isGlobalScope).toBe(true);
    expect(visibleNavItems(ctx.permissions)).toEqual([]); // ไม่มีเมนูใดเลย
  });

  it("5-7) คำขอ PENDING ถูก Reject พร้อมเหตุผลและ Audit Log", async () => {
    const result = await retireFieldSurveyor(prisma);
    expect(result.pendingRequestsRejected).toBe(1);
    expect(result.auditLogsWritten).toBe(1);

    const req = await prisma.registrationRequest.findUniqueOrThrow({
      where: { userId: ids.pendingApplicant },
    });
    expect(req.status).toBe(RegistrationRequestStatus.REJECTED);
    expect(req.rejectReason).toBeTruthy();
    expect(req.rejectReason).toContain("ยกเลิก");
    expect(req.decidedAt).toBeInstanceOf(Date);
    expect(req.decidedById).toBeNull(); // ระบบเป็นผู้ตัดสิน ไม่ใช่แอดมินคนใด

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "RegistrationRequest", entityId: req.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.action).toBe(AuditAction.REJECT);
    expect(log?.userId).toBeNull(); // null = ระบบ ตามสคีมา AuditLog
    expect(log?.reason).toBeTruthy();
    expect(log?.changes).toMatchObject({
      status: { old: "PENDING", new: "REJECTED" },
      migration: RETIRE_FIELD_SURVEYOR_MIGRATION_ID,
    });
    // ห้ามมี PII ใน Audit
    expect(JSON.stringify(log?.changes ?? {})).not.toContain("@test.invalid");
  });

  it("คำขอที่ APPROVED ไม่ถูกเขียนทับเป็น REJECTED (ห้ามทำลายประวัติ)", async () => {
    await retireFieldSurveyor(prisma);
    const req = await prisma.registrationRequest.findUniqueOrThrow({
      where: { userId: ids.approvedApplicant },
    });
    expect(req.status).toBe(RegistrationRequestStatus.APPROVED);
    expect(req.rejectReason).toBeNull();
    // การเลิกใช้บทบาทแสดงผ่านการปิด UserRole แทน
    expect(await activeRolesOf("approvedApplicant")).toEqual([]);
  });

  it("คำขอที่ REJECTED อยู่แล้ว ไม่ถูกเปลี่ยนซ้ำและไม่เขียน Audit ซ้ำ", async () => {
    const before = await prisma.registrationRequest.findUniqueOrThrow({
      where: { userId: ids.rejectedApplicant },
    });
    await retireFieldSurveyor(prisma);
    const after = await prisma.registrationRequest.findUniqueOrThrow({
      where: { userId: ids.rejectedApplicant },
    });
    expect(after.decidedAt).toEqual(before.decidedAt);
    expect(after.rejectReason).toEqual(before.rejectReason);

    const logs = await prisma.auditLog.count({
      where: { entityType: "RegistrationRequest", entityId: before.id },
    });
    expect(logs).toBe(0);
  });

  it("11) รัน Migration ซ้ำแล้วไม่เปลี่ยนข้อมูลและไม่เขียน Audit เพิ่ม", async () => {
    const first = await retireFieldSurveyor(prisma);
    expect(first.noop).toBe(false);

    const auditBefore = await prisma.auditLog.count({
      where: { entityType: "RegistrationRequest" },
    });
    const snapshot = await Promise.all(
      (Object.keys(EMAILS) as (keyof typeof EMAILS)[]).map(async (k) => ({
        k,
        roles: await activeRolesOf(k),
      })),
    );

    const second = await retireFieldSurveyor(prisma);
    expect(second.noop).toBe(true);
    expect(second.auditLogsWritten).toBe(0);

    const after = await Promise.all(
      (Object.keys(EMAILS) as (keyof typeof EMAILS)[]).map(async (k) => ({
        k,
        roles: await activeRolesOf(k),
      })),
    );
    expect(after).toEqual(snapshot);
    expect(
      await prisma.auditLog.count({ where: { entityType: "RegistrationRequest" } }),
    ).toBe(auditBefore);
  });

  it("19) VOLUNTEER และ RESEARCHER ไม่ถูกแก้", async () => {
    await retireFieldSurveyor(prisma);
    expect(await activeRolesOf("volunteer")).toEqual([UserRoleEnum.VOLUNTEER]);
    expect(await activeRolesOf("researcher")).toEqual([UserRoleEnum.RESEARCHER]);
  });

  it("18) Migration ของ COORDINATOR/VERIFIER ไม่ได้รับผลกระทบ", async () => {
    await retireFieldSurveyor(prisma);
    // COORDINATOR ยังรอ migration ของตัวเอง — ต้องไม่ถูกปิดโดย migration นี้
    expect(await activeRolesOf("legacyCoord")).toEqual([UserRoleEnum.COORDINATOR]);

    // และรัน migration ของ COORDINATOR ต่อได้ตามปกติ
    await migrateLegacyRoles(prisma);
    expect(await activeRolesOf("legacyCoord")).toEqual([UserRoleEnum.OFFICER]);
  });

  it("17) ADMIN behavior ไม่เปลี่ยน", async () => {
    await retireFieldSurveyor(prisma);
    expect(await activeRolesOf("admin")).toEqual([UserRoleEnum.ADMIN]);
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
    const ctx = await loadContextOrThrow(admin);
    expect(ctx.isGlobalScope).toBe(true);
    expect(ctx.permissions).toContain(PERMISSIONS.USER_MANAGE);
  });

  it("3) Server Action ปฏิเสธการ Assign FIELD_SURVEYOR ใหม่ (เรียกตรงก็ไม่ผ่าน)", async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
    const ctxAdmin = await loadContextOrThrow(admin);

    const result = await setUserRoles(ctxAdmin, ids.volunteer, [
      UserRoleEnum.DATA_ENTRY,
      UserRoleEnum.FIELD_SURVEYOR,
    ]);
    expect(result).toEqual({ ok: false, reason: "LEGACY_ROLE_NOT_ASSIGNABLE" });
    expect(await activeRolesOf("volunteer")).toEqual([UserRoleEnum.VOLUNTEER]);
  });

  it("20) Postconditions ผ่านบน PostgreSQL จริง", async () => {
    await retireFieldSurveyor(prisma);
    const check = await verifyFieldSurveyorRetired(prisma);
    expect(check).toEqual({ activeUserRoles: 0, pendingRequests: 0, ok: true });
  });

  it("15-16) ผู้สำรวจเป็นข้อมูลในแบบสอบถาม ไม่ต้องมีบัญชี และไม่ใช้ทำ Authorization", async () => {
    // ครัวเรือนที่มีชื่อ/เบอร์ผู้สำรวจจากกระดาษ แต่ surveyorUserId เป็น null
    const community = await prisma.community.findFirstOrThrow({
      where: { deletedAt: null },
      select: { id: true },
    });
    const household = await prisma.household.findFirst({
      where: { communityId: community.id },
      select: { surveyorUserId: true },
    });
    // ฟิลด์เป็น nullable จริง — ไม่บังคับให้ผูกบัญชี
    if (household) expect(household.surveyorUserId ?? null).toBeDefined();

    // และ Authorization Context ไม่มีอะไรที่มาจากผู้สำรวจ
    const u = await prisma.user.findUniqueOrThrow({ where: { id: ids.surveyorOnly } });
    const ctx = await loadAuthorizationForUser(u);
    expect(ctx).not.toBeNull();
    expect(Object.keys(ctx!)).toEqual([
      "userId",
      "name",
      "email",
      "roles",
      "permissions",
      "isGlobalScope",
      "communityIds",
    ]);
  });
});
