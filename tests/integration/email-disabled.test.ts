import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  AuditAction,
  PrismaClient,
  RegistrationRequestStatus,
  UserRoleEnum,
} from "@prisma/client";
import { auth } from "../../lib/auth";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import {
  approveRegistration,
  submitRegistration,
} from "../../lib/registration/core";
import {
  clearMustChangePassword,
  resetUserPassword,
} from "../../lib/admin/user-password";
import type { RegistrationInput } from "../../lib/registration/validation";

// Integration tests — ธง EMAIL_ENABLED + ADMIN ตั้งรหัสผ่านชั่วคราว
// (Owner Decision 2026-10-17: ปิดระบบอีเมลไว้ ไม่ลบ)
// -----------------------------------------------------------------------------
// รันเฉพาะ local dev DB — fixtures สังเคราะห์ (test-nomail-*@test.invalid) ลบใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  admin: "test-nomail-admin@test.invalid",
  applicant: "test-nomail-applicant@test.invalid",
  target: "test-nomail-target@test.invalid",
  outsider: "test-nomail-outsider@test.invalid",
} as const;
const PASSWORD = "Test.NoMail.Password.01";

const ORIGINAL_FLAG = process.env.EMAIL_ENABLED;

function setEmailEnabled(enabled: boolean) {
  process.env.EMAIL_ENABLED = enabled ? "true" : "false";
}

function makeInput(email: string): RegistrationInput {
  return {
    email,
    password: PASSWORD,
    firstName: "NoMail",
    lastName: "Fixture",
    phone: undefined,
    requestedRole: UserRoleEnum.DATA_ENTRY,
    communityId: undefined,
    organization: undefined,
    note: undefined,
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
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
  }
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(EMAILS) } },
  });
}

describe.skipIf(!isLocalDevDb)("Integration: ปิดระบบอีเมล + รหัสผ่านชั่วคราว", () => {
  let adminCtx: AuthorizationContext;
  let outsiderCtx: AuthorizationContext;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    await cleanupFixtures();

    // ตั้งรหัสผ่านให้ผู้อื่นต้องเป็น "บัญชีคุ้มครอง" ด้วย (Owner Decision 2026-10-18)
    // fixture นี้จึงต้องมีธง มิฉะนั้นจะถูกปฏิเสธตั้งแต่ด่านแรก
    const admin = await prisma.user.create({
      data: {
        email: EMAILS.admin,
        name: "NoMail Admin",
        isActive: true,
        isProtectedAccount: true,
      },
    });
    await prisma.userRole.create({
      data: { userId: admin.id, role: UserRoleEnum.ADMIN, isActive: true },
    });
    adminCtx = await loadContextOrThrow({
      id: admin.id,
      name: admin.name,
      email: admin.email,
    });

    // บัญชีที่มีสิทธิ์อื่นแต่ไม่มี user.password-reset — ใช้ยืนยันว่า RBAC กันได้จริง
    const outsider = await prisma.user.create({
      data: { email: EMAILS.outsider, name: "NoMail Officer", isActive: true },
    });
    await prisma.userRole.create({
      data: { userId: outsider.id, role: UserRoleEnum.OFFICER, isActive: true },
    });
    outsiderCtx = await loadContextOrThrow({
      id: outsider.id,
      name: outsider.name,
      email: outsider.email,
    });
  });

  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.EMAIL_ENABLED;
    else process.env.EMAIL_ENABLED = ORIGINAL_FLAG;
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  it("ปิดอีเมล → สมัครได้ตามปกติ แต่ไม่ส่งอีเมลยืนยัน", async () => {
    setEmailEnabled(false);
    const result = await submitRegistration(makeInput(EMAILS.applicant));
    expect(result).toEqual({ ok: true, verificationEmailSent: false });

    const user = await prisma.user.findUnique({
      where: { email: EMAILS.applicant },
      select: { id: true, isActive: true, emailVerified: true },
    });
    // ด่านกันคนนอกตัวจริงยังอยู่ครบ — บัญชีใหม่ยัง inactive และยังไม่ยืนยันอีเมล
    expect(user!.isActive).toBe(false);
    expect(user!.emailVerified).toBe(false);

    const request = await prisma.registrationRequest.findUnique({
      where: { userId: user!.id },
      select: { status: true },
    });
    expect(request?.status).toBe(RegistrationRequestStatus.PENDING);
  });

  it("เปิดอีเมล → ยังบังคับยืนยันอีเมลก่อนอนุมัติเหมือนเดิม", async () => {
    setEmailEnabled(true);
    const request = await prisma.registrationRequest.findFirst({
      where: { user: { email: EMAILS.applicant } },
      select: { id: true },
    });
    expect(await approveRegistration(adminCtx, request!.id)).toEqual({
      ok: false,
      reason: "EMAIL_NOT_VERIFIED",
    });
  });

  it("ปิดอีเมล → อนุมัติได้ทั้งที่ยังไม่ยืนยันอีเมล (ไม่งั้นจะอนุมัติใครไม่ได้เลย)", async () => {
    setEmailEnabled(false);
    const request = await prisma.registrationRequest.findFirst({
      where: { user: { email: EMAILS.applicant } },
      select: { id: true, userId: true },
    });
    expect(await approveRegistration(adminCtx, request!.id)).toEqual({ ok: true });

    const user = await prisma.user.findUnique({
      where: { id: request!.userId },
      select: { isActive: true, emailVerified: true },
    });
    expect(user!.isActive).toBe(true);
    // อนุมัติแล้วต้องไม่ไป "แอบ" ตั้ง emailVerified ให้ — อีเมลยังไม่เคยถูกยืนยันจริง
    expect(user!.emailVerified).toBe(false);
  });

  describe("ADMIN ตั้งรหัสผ่านชั่วคราว", () => {
    let targetId: string;
    /** รหัสที่ระบบออกให้จริง — ใช้ตรวจว่าไม่รั่วไปอยู่ใน Audit Log */
    let issuedPassword = "";

    beforeAll(async () => {
      setEmailEnabled(false);
      await submitRegistration(makeInput(EMAILS.target));
      const user = await prisma.user.findUnique({
        where: { email: EMAILS.target },
        select: { id: true },
      });
      targetId = user!.id;
      await prisma.user.update({
        where: { id: targetId },
        data: { isActive: true },
      });
    });

    it("ไม่มีสิทธิ์ user.password-reset → ถูกปฏิเสธ", async () => {
      expect(await resetUserPassword(outsiderCtx, targetId)).toEqual({
        ok: false,
        reason: "NOT_ALLOWED",
      });
    });

    it("ตั้งให้บัญชีตัวเองไม่ได้", async () => {
      expect(await resetUserPassword(adminCtx, adminCtx.userId)).toEqual({
        ok: false,
        reason: "SELF_RESET",
      });
    });

    it("ไม่พบผู้ใช้ → USER_NOT_FOUND", async () => {
      expect(await resetUserPassword(adminCtx, "no-such-user-id")).toEqual({
        ok: false,
        reason: "USER_NOT_FOUND",
      });
    });

    it("สำเร็จ → ล็อกอินด้วยรหัสใหม่ได้ · รหัสเดิมใช้ไม่ได้ · ถูกบังคับเปลี่ยนรหัส · session เดิมถูกตัด", async () => {
      // session ค้างอยู่ก่อนตั้งรหัสใหม่ — ต้องถูกลบทิ้งทั้งหมด
      await auth.api.signInEmail({
        body: { email: EMAILS.target, password: PASSWORD },
      });
      expect(await prisma.session.count({ where: { userId: targetId } })).toBeGreaterThan(0);

      const result = await resetUserPassword(adminCtx, targetId);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      issuedPassword = result.tempPassword;

      expect(await prisma.session.count({ where: { userId: targetId } })).toBe(0);

      const user = await prisma.user.findUnique({
        where: { id: targetId },
        select: { mustChangePassword: true },
      });
      expect(user!.mustChangePassword).toBe(true);

      // รหัสเดิมต้องใช้ไม่ได้แล้ว
      await expect(
        auth.api.signInEmail({
          body: { email: EMAILS.target, password: PASSWORD },
        }),
      ).rejects.toThrow();

      // รหัสชั่วคราวต้องใช้ล็อกอินได้จริง
      const signedIn = await auth.api.signInEmail({
        body: { email: EMAILS.target, password: result.tempPassword },
      });
      expect(signedIn.user.id).toBe(targetId);
    });

    it("เขียน Audit Log โดยไม่มีค่ารหัสผ่านอยู่ในนั้น", async () => {
      const audit = await prisma.auditLog.findFirst({
        where: {
          entityType: "UserCredential",
          entityId: targetId,
          action: AuditAction.UPDATE,
          reason: "admin-temp-password",
        },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).not.toBeNull();
      expect(audit!.userId).toBe(adminCtx.userId);
      // ทั้งแถวต้องไม่มีรหัสจริงปนอยู่เลย — ไม่ใช่แค่ช่อง changes
      expect(issuedPassword.length).toBeGreaterThan(0);
      expect(JSON.stringify(audit)).not.toContain(issuedPassword);
      // แต่ต้องบอกได้ว่าเกิดอะไรขึ้น มิฉะนั้นตรวจย้อนหลังไม่ได้
      expect(JSON.stringify(audit!.changes)).toContain("admin-temp-password");
    });

    it("clearMustChangePassword ล้างธงให้ผู้ใช้กลับมาใช้งานได้", async () => {
      await clearMustChangePassword(targetId);
      const user = await prisma.user.findUnique({
        where: { id: targetId },
        select: { mustChangePassword: true },
      });
      expect(user!.mustChangePassword).toBe(false);
    });
  });
});
