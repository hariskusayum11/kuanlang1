import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AuditAction, PrismaClient } from "@prisma/client";
import { auth } from "../../lib/auth";
import { fetchDashboardCounts } from "../../lib/dashboard/stats";

// Integration tests — Authentication Foundation (Better Auth + local Dev DB)
// -----------------------------------------------------------------------------
// เงื่อนไข skip เหมือน db.test.ts: ต้องรู้ค่าตั้งแต่ collection time
// รันเฉพาะเมื่อ DATABASE_URL ชี้ local dev (localhost/127.0.0.1) เท่านั้น
// fixtures ใช้ email synthetic prefix test-auth- domain @test.invalid เท่านั้น
// ห้ามแตะบัญชี dev-admin@test.invalid (Development Test User ของเครื่อง)
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const FIXTURE_EMAIL = "test-auth-user@test.invalid";
const FIXTURE_INACTIVE_EMAIL = "test-auth-inactive@test.invalid";
const FIXTURE_PASSWORD = "Test.Auth.Password.01";

async function cleanupFixtures() {
  // ลบเฉพาะ fixture emails — Session/Account ลบตาม cascade (onDelete: Cascade)
  // AuditLog ไม่ cascade (append-only, userId เป็น SetNull) → ลบ audit ของ fixture ก่อนในเทสต์
  const users = await prisma.user.findMany({
    where: { email: { in: [FIXTURE_EMAIL, FIXTURE_INACTIVE_EMAIL] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.user.deleteMany({
    where: { email: { in: [FIXTURE_EMAIL, FIXTURE_INACTIVE_EMAIL] } },
  });
}

describe.skipIf(!isLocalDevDb)("Integration: Authentication Foundation (Better Auth)", () => {
  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      throw new Error(
        `[integration] เชื่อมต่อ Development DB ไม่ได้ (DATABASE_URL local) — ` +
          `ตรวจว่า docker compose up -d db แล้ว migration ถูก apply: ${String(e)}`,
      );
    }
    await cleanupFixtures();
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  it("signUpEmail สร้าง user + credential account — เกิดมาเป็น inactive เสมอ", async () => {
    await auth.api.signUpEmail({
      body: { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD, name: "Test Auth User" },
    });

    const user = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL } });
    expect(user).not.toBeNull();
    // Self-registration + Approval: บัญชีใหม่ทุกบัญชี isActive=false (user.create.before hook)
    expect(user?.isActive).toBe(false);

    const credential = await prisma.account.findFirst({
      where: { userId: user!.id, providerId: "credential" },
    });
    expect(credential).not.toBeNull();
    expect(credential?.password ?? "").not.toBe("");
    // hash ต้องไม่ใช่ plaintext
    expect(credential?.password).not.toBe(FIXTURE_PASSWORD);

    // autoSignIn ปิดแล้ว — ต้องไม่มี session เกิดจากการสมัคร
    const sessions = await prisma.session.count({ where: { userId: user!.id } });
    expect(sessions).toBe(0);
  });

  it("signInEmail รหัสผ่านผิด → ถูกปฏิเสธ (ไม่สร้าง session)", async () => {
    await expect(
      auth.api.signInEmail({
        body: { email: FIXTURE_EMAIL, password: "wrong-password-123" },
      }),
    ).rejects.toThrow();

    const user = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL } });
    const sessions = await prisma.session.count({ where: { userId: user!.id } });
    expect(sessions).toBe(0);
  });

  it("signInEmail ถูกต้อง → สำเร็จ และมี session row ใน DB", async () => {
    // จำลองการอนุมัติของแอดมิน — activate ก่อน จึงจะ login ได้
    await prisma.user.update({
      where: { email: FIXTURE_EMAIL },
      data: { isActive: true },
    });
    const result = await auth.api.signInEmail({
      body: { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD },
    });
    expect(result.user.email).toBe(FIXTURE_EMAIL);
    expect(result.token).toBeTruthy();

    const user = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL } });
    const sessions = await prisma.session.count({ where: { userId: user!.id } });
    expect(sessions).toBeGreaterThanOrEqual(1);
  });

  it("signInEmail สำเร็จ → เขียน Audit LOGIN + อัปเดต lastLoginAt (session.create.after hook)", async () => {
    const user = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL } });
    expect(user).not.toBeNull();

    // lastLoginAt ถูกตั้งจากการ sign-in สำเร็จก่อนหน้า (best-effort hook)
    expect(user?.lastLoginAt).not.toBeNull();

    const loginAudit = await prisma.auditLog.findFirst({
      where: { userId: user!.id, action: AuditAction.LOGIN, entityType: "Session" },
    });
    expect(loginAudit).not.toBeNull();
    expect(loginAudit?.entityId).toBeTruthy(); // = session id ที่เพิ่งสร้าง
    // Audit เป็น append-only + ไม่มี PII — เก็บแค่ metadata อ้างอิง
    expect(loginAudit?.changes).toBeNull();
  });

  it("ผู้ใช้ inactive → signInEmail ถูกบล็อกโดย databaseHook (ไม่สร้าง session)", async () => {
    await auth.api.signUpEmail({
      body: {
        email: FIXTURE_INACTIVE_EMAIL,
        password: FIXTURE_PASSWORD,
        name: "Test Auth Inactive User",
      },
    });
    const user = await prisma.user.findUnique({ where: { email: FIXTURE_INACTIVE_EMAIL } });
    expect(user).not.toBeNull();
    // บัญชีใหม่ inactive อยู่แล้วโดย hook — ยืนยันซ้ำเพื่อความชัดของ test
    expect(user?.isActive).toBe(false);

    await expect(
      auth.api.signInEmail({
        body: { email: FIXTURE_INACTIVE_EMAIL, password: FIXTURE_PASSWORD },
      }),
    ).rejects.toThrow();

    const sessions = await prisma.session.count({ where: { userId: user!.id } });
    expect(sessions).toBe(0);
  });

  it("Dashboard data layer: fetchDashboardCounts ตรงกับ Dev Seed (5/2/5/0/0)", async () => {
    const counts = await fetchDashboardCounts();
    expect(counts).toEqual({
      communities: 5,
      tambons: 2,
      moos: 5,
      households: 0,
      evacuationSites: 0,
    });
  });

  it("Fixtures cleanup: บัญชี dev-admin ไม่ถูกแตะ", async () => {
    const devAdmin = await prisma.user.findUnique({
      where: { email: "dev-admin@test.invalid" },
    });
    expect(devAdmin).not.toBeNull();
    expect(devAdmin?.isActive).toBe(true);
  });
});
