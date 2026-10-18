import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  AuditAction,
  PrismaClient,
  RegistrationRequestStatus,
  UserRoleEnum,
} from "@prisma/client";
import { auth } from "../../lib/auth";
import { loadAuthorizationForUser } from "../../lib/authz/load-authorization";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import {
  approveRegistration,
  listRegistrationRequests,
  rejectRegistration,
  submitRegistration,
} from "../../lib/registration/core";
import type {
  RegistrationInput,
  RequestableRole,
} from "../../lib/registration/validation";

// Integration tests — Self-registration + Approval (docs/26 §5)
// -----------------------------------------------------------------------------
// รันเฉพาะ local dev DB — fixtures สังเคราะห์ (test-reg-*@test.invalid) ลบใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  admin: "test-reg-admin@test.invalid",
  applicant1: "test-reg-applicant1@test.invalid",
  applicant2: "test-reg-applicant2@test.invalid",
  race: "test-reg-race@test.invalid",
  grantExecutive: "test-reg-grant-exec@test.invalid",
  grantDefault: "test-reg-grant-default@test.invalid",
  grantAdmin: "test-reg-grant-admin@test.invalid",
} as const;
const PASSWORD = "Test.Reg.Password.01";
const COMMUNITY_CODE = "TEST-REG-C1";

function makeInput(
  email: string,
  overrides?: Partial<RegistrationInput>,
): RegistrationInput {
  return {
    email,
    password: PASSWORD,
    firstName: "Reg",
    lastName: `Fixture ${email}`,
    phone: undefined,
    requestedRole: UserRoleEnum.DATA_ENTRY,
    communityId: undefined,
    organization: undefined,
    note: undefined,
    ...overrides,
  };
}

async function cleanupFixtures() {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    // AuditLog เป็น append-only (SetNull) — ลบเฉพาะในเทสต์ก่อนลบ user
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  }
  // RegistrationRequest/UserRole/Scope/Session/Account ลบตาม cascade ของ user
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(EMAILS) } },
  });
  await prisma.community.deleteMany({ where: { code: COMMUNITY_CODE } });
}

describe.skipIf(!isLocalDevDb)("Integration: Self-registration + Approval", () => {
  let adminCtx: AuthorizationContext;
  let communityId: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    await cleanupFixtures();

    const community = await prisma.community.create({
      data: { code: COMMUNITY_CODE, nameTh: "ชุมชนทดสอบลงทะเบียน" },
    });
    communityId = community.id;

    // แอดมินผู้ตัดสิน (สร้างตรงผ่าน prisma — ไม่ login จึงไม่ต้องมี credential)
    const admin = await prisma.user.create({
      data: { email: EMAILS.admin, name: "Reg Fixture Admin", isActive: true },
    });
    await prisma.userRole.create({
      data: { userId: admin.id, role: UserRoleEnum.ADMIN, isActive: true },
    });
    adminCtx = await loadContextOrThrow({
      id: admin.id,
      name: admin.name,
      email: admin.email,
    });
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  it("submitRegistration → user inactive + credential + request PENDING + audit CREATE — login ยังไม่ได้", async () => {
    const result = await submitRegistration(
      makeInput(EMAILS.applicant1, {
        communityId,
        phone: "081-000-0001",
        organization: "ม.ทักษิณ",
      }),
    );
    expect(result).toEqual({ ok: true, verificationEmailSent: true });

    const user = await prisma.user.findUnique({
      where: { email: EMAILS.applicant1 },
    });
    expect(user).not.toBeNull();
    expect(user!.isActive).toBe(false);
    expect(user!.phone).toBe("081-000-0001");

    const credential = await prisma.account.findFirst({
      where: { userId: user!.id, providerId: "credential" },
    });
    expect(credential?.password ?? "").not.toBe("");
    expect(credential?.password).not.toBe(PASSWORD);

    const request = await prisma.registrationRequest.findUnique({
      where: { userId: user!.id },
    });
    expect(request?.status).toBe(RegistrationRequestStatus.PENDING);
    expect(request?.requestedRole).toBe(UserRoleEnum.DATA_ENTRY);
    expect(request?.communityId).toBe(communityId);
    expect(request?.organization).toBe("ม.ทักษิณ");

    // ยังไม่ถูกมอบ role/scope ใด — least privilege จนกว่าจะอนุมัติ
    expect(await prisma.userRole.count({ where: { userId: user!.id } })).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: user!.id,
        action: AuditAction.CREATE,
        entityType: "RegistrationRequest",
      },
    });
    expect(audit).not.toBeNull();

    // login ก่อนอนุมัติ → ถูกบล็อกโดย session hook (รหัสถูกต้องก็ตาม)
    await expect(
      auth.api.signInEmail({
        body: { email: EMAILS.applicant1, password: PASSWORD },
      }),
    ).rejects.toThrow();
  });

  it("อีเมลซ้ำ → EMAIL_TAKEN (ไม่สร้างอะไรเพิ่ม)", async () => {
    const result = await submitRegistration(makeInput(EMAILS.applicant1));
    expect(result).toEqual({ ok: false, reason: "EMAIL_TAKEN" });
    expect(
      await prisma.user.count({ where: { email: EMAILS.applicant1 } }),
    ).toBe(1);
  });

  it("communityId ไม่มีจริง → INVALID_COMMUNITY และไม่สร้าง user", async () => {
    const result = await submitRegistration(
      makeInput(EMAILS.applicant2, { communityId: "cnope00000000000000000000" }),
    );
    expect(result).toEqual({ ok: false, reason: "INVALID_COMMUNITY" });
    expect(
      await prisma.user.count({ where: { email: EMAILS.applicant2 } }),
    ).toBe(0);
  });

  it("listRegistrationRequests: แอดมินเห็นคำขอ PENDING — ผู้ไม่มีสิทธิ์ได้ null", async () => {
    const data = await listRegistrationRequests(adminCtx);
    expect(data).not.toBeNull();
    expect(
      data!.pending.some((r) => r.user.email === EMAILS.applicant1),
    ).toBe(true);

    // ผู้สมัครที่ยังไม่ถูกอนุมัติเป็นบัญชี inactive → โหลด Authorization Context ไม่ได้เลย
    // (แข็งแรงกว่าเดิมที่เคยได้ context ว่าง ๆ แล้วค่อยไปโดนปฏิเสธที่ปลายทาง)
    const applicant = await prisma.user.findUniqueOrThrow({
      where: { email: EMAILS.applicant1 },
    });
    expect(
      await loadAuthorizationForUser({
        id: applicant.id,
        name: applicant.name,
        email: applicant.email,
      }),
    ).toBeNull();

    // และต่อให้มี context ที่ active แต่ไม่มีสิทธิ์ ก็ต้องถูกปฏิเสธ (RBAC ไม่ใช่แค่สถานะบัญชี)
    const powerless: AuthorizationContext = {
      ...adminCtx,
      userId: applicant.id,
      permissions: [],
      roles: [],
    };
    expect(await listRegistrationRequests(powerless)).toBeNull();
  });

  it("approveRegistration → activate + มอบ role/scope + audit APPROVE — แล้ว login ได้จริง", async () => {
    const applicant = await prisma.user.findUniqueOrThrow({
      where: { email: EMAILS.applicant1 },
    });
    const request = await prisma.registrationRequest.findUniqueOrThrow({
      where: { userId: applicant.id },
    });

    // ผู้สมัครใหม่ต้องยืนยันอีเมลก่อน แอดมินจึงอนุมัติได้
    expect(await approveRegistration(adminCtx, request.id)).toEqual({
      ok: false,
      reason: "EMAIL_NOT_VERIFIED",
    });
    await prisma.user.update({
      where: { id: applicant.id },
      data: { emailVerified: true },
    });

    const result = await approveRegistration(adminCtx, request.id);
    expect(result).toEqual({ ok: true });

    const after = await prisma.registrationRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(after.status).toBe(RegistrationRequestStatus.APPROVED);
    expect(after.decidedById).toBe(adminCtx.userId);
    expect(after.decidedAt).not.toBeNull();

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: applicant.id },
    });
    expect(user.isActive).toBe(true);

    const role = await prisma.userRole.findUnique({
      where: {
        userId_role: { userId: applicant.id, role: UserRoleEnum.DATA_ENTRY },
      },
    });
    expect(role?.isActive).toBe(true);
    expect(role?.assignedBy).toBe(adminCtx.userId);

    const scope = await prisma.userCommunityScope.findUnique({
      where: { userId_communityId: { userId: applicant.id, communityId } },
    });
    expect(scope).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: adminCtx.userId,
        action: AuditAction.APPROVE,
        entityType: "RegistrationRequest",
        entityId: request.id,
      },
    });
    expect(audit).not.toBeNull();

    // หลังอนุมัติ → login ได้ทันทีด้วยรหัสที่ตั้งตอนสมัคร (ไม่มีลิงก์/ขั้นตอนเพิ่ม)
    const signIn = await auth.api.signInEmail({
      body: { email: EMAILS.applicant1, password: PASSWORD },
    });
    expect(signIn.user.email).toBe(EMAILS.applicant1);
  });

  describe("ADMIN เลือกบทบาทจริงตอนอนุมัติ (Owner Decision 2026-10-18)", () => {
    /** ผู้สมัครรายใหม่ที่ยืนยันอีเมลแล้ว พร้อมให้อนุมัติ */
    async function freshApplicant(email: string, requestedRole: RequestableRole) {
      await submitRegistration(makeInput(email, { requestedRole }));
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
      const request = await prisma.registrationRequest.findUniqueOrThrow({
        where: { userId: user.id },
      });
      return { user, request };
    }

    it("สมัครเป็น 'เจ้าหน้าที่หน่วยงาน' → ADMIN ยกให้เป็น EXECUTIVE ได้", async () => {
      const { user, request } = await freshApplicant(
        EMAILS.grantExecutive,
        UserRoleEnum.OFFICER,
      );

      expect(
        await approveRegistration(adminCtx, request.id, UserRoleEnum.EXECUTIVE),
      ).toEqual({ ok: true });

      const roles = await prisma.userRole.findMany({
        where: { userId: user.id, isActive: true },
        select: { role: true },
      });
      // ได้เฉพาะบทบาทที่ ADMIN มอบ — ไม่ติดบทบาทที่ขอมาด้วย
      expect(roles.map((r) => r.role)).toEqual([UserRoleEnum.EXECUTIVE]);
    });

    it("บันทึก Audit ทั้งบทบาทที่ขอและที่มอบจริง เมื่อ ADMIN เปลี่ยน", async () => {
      const request = await prisma.registrationRequest.findFirstOrThrow({
        where: { user: { email: EMAILS.grantExecutive } },
      });
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: AuditAction.APPROVE,
          entityType: "RegistrationRequest",
          entityId: request.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit?.changes).toMatchObject({
        requestedRole: UserRoleEnum.OFFICER,
        grantedRole: UserRoleEnum.EXECUTIVE,
        roleChangedByAdmin: true,
      });
    });

    it("ไม่ส่งบทบาทมา → ใช้ตามที่ผู้สมัครเสนอ", async () => {
      const { user, request } = await freshApplicant(
        EMAILS.grantDefault,
        UserRoleEnum.DATA_ENTRY,
      );
      expect(await approveRegistration(adminCtx, request.id)).toEqual({ ok: true });
      const roles = await prisma.userRole.findMany({
        where: { userId: user.id, isActive: true },
        select: { role: true },
      });
      expect(roles.map((r) => r.role)).toEqual([UserRoleEnum.DATA_ENTRY]);
    });

    it("ยก ADMIN ผ่านคิวอนุมัติไม่ได้ — ต้องทำที่หน้าจัดการผู้ใช้", async () => {
      const { user, request } = await freshApplicant(
        EMAILS.grantAdmin,
        UserRoleEnum.VOLUNTEER,
      );
      expect(
        await approveRegistration(adminCtx, request.id, UserRoleEnum.ADMIN),
      ).toEqual({ ok: false, reason: "INVALID_ROLE" });

      // คำขอต้องยังค้างอยู่ และบัญชีต้องยังเข้าระบบไม่ได้
      const after = await prisma.registrationRequest.findUniqueOrThrow({
        where: { id: request.id },
      });
      expect(after.status).toBe(RegistrationRequestStatus.PENDING);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isActive,
      ).toBe(false);
    });
  });

  it("อนุมัติซ้ำ → NOT_FOUND_OR_DECIDED", async () => {
    const applicant = await prisma.user.findUniqueOrThrow({
      where: { email: EMAILS.applicant1 },
    });
    const request = await prisma.registrationRequest.findUniqueOrThrow({
      where: { userId: applicant.id },
    });
    const result = await approveRegistration(adminCtx, request.id);
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND_OR_DECIDED" });
  });

  it("rejectRegistration → REJECTED + เหตุผล + user ยัง inactive + audit REJECT", async () => {
    const submitted = await submitRegistration(
      makeInput(EMAILS.applicant2, { requestedRole: UserRoleEnum.VOLUNTEER }),
    );
    expect(submitted).toEqual({ ok: true, verificationEmailSent: true });

    const applicant = await prisma.user.findUniqueOrThrow({
      where: { email: EMAILS.applicant2 },
    });
    const request = await prisma.registrationRequest.findUniqueOrThrow({
      where: { userId: applicant.id },
    });

    const result = await rejectRegistration(
      adminCtx,
      request.id,
      "ไม่พบชื่อในรายชื่อผู้ได้รับมอบหมาย",
    );
    expect(result).toEqual({ ok: true });

    const after = await prisma.registrationRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(after.status).toBe(RegistrationRequestStatus.REJECTED);
    expect(after.rejectReason).toBe("ไม่พบชื่อในรายชื่อผู้ได้รับมอบหมาย");

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: applicant.id },
    });
    expect(user.isActive).toBe(false);
    expect(await prisma.userRole.count({ where: { userId: applicant.id } })).toBe(0);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AuditAction.REJECT,
        entityType: "RegistrationRequest",
        entityId: request.id,
      },
    });
    expect(audit?.reason).toBe("ไม่พบชื่อในรายชื่อผู้ได้รับมอบหมาย");
  });

  it("ผู้ไม่มีสิทธิ์ตัดสิน → FORBIDDEN (RBAC ฝั่ง server ไม่ใช่แค่ซ่อนปุ่ม)", async () => {
    const applicant = await prisma.user.findUniqueOrThrow({
      where: { email: EMAILS.applicant2 },
    });
    const request = await prisma.registrationRequest.findUniqueOrThrow({
      where: { userId: applicant.id },
    });
    // บัญชี inactive ไม่มี context ให้ใช้ตั้งแต่แรก
    expect(
      await loadAuthorizationForUser({
        id: applicant.id,
        name: applicant.name,
        email: applicant.email,
      }),
    ).toBeNull();

    // ตรวจ RBAC แยกจากสถานะบัญชี: context ที่ active แต่ไม่มี registration.manage
    const powerless: AuthorizationContext = {
      ...adminCtx,
      userId: applicant.id,
      permissions: [],
      roles: [],
    };
    expect(await approveRegistration(powerless, request.id)).toEqual({
      ok: false,
      reason: "FORBIDDEN",
    });
    expect(await rejectRegistration(powerless, request.id, "เหตุผล")).toEqual({
      ok: false,
      reason: "FORBIDDEN",
    });
  });

  it("race: สองแอดมินอนุมัติพร้อมกัน → สำเร็จคนเดียวเท่านั้น", async () => {
    const submitted = await submitRegistration(makeInput(EMAILS.race));
    expect(submitted).toEqual({ ok: true, verificationEmailSent: true });
    const applicant = await prisma.user.findUniqueOrThrow({
      where: { email: EMAILS.race },
    });
    const request = await prisma.registrationRequest.findUniqueOrThrow({
      where: { userId: applicant.id },
    });
    await prisma.user.update({
      where: { id: applicant.id },
      data: { emailVerified: true },
    });

    const [r1, r2] = await Promise.all([
      approveRegistration(adminCtx, request.id),
      approveRegistration(adminCtx, request.id),
    ]);
    const okCount = [r1, r2].filter((r) => r.ok).length;
    expect(okCount).toBe(1);

    const after = await prisma.registrationRequest.findUniqueOrThrow({
      where: { id: request.id },
    });
    expect(after.status).toBe(RegistrationRequestStatus.APPROVED);
  });
});
