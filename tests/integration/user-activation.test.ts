import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  AuditAction,
  PrismaClient,
  RegistrationRequestStatus,
  UserRoleEnum,
} from "@prisma/client";
import { loadAuthorizationForUser } from "../../lib/authz/load-authorization";
import { loadContextOrThrow } from "../helpers/authz";
import { PERMISSIONS } from "../../lib/authz/permissions";
import type { AuthorizationContext } from "../../lib/authz/types";
import { listUsers, setUserActive, setUserRoles } from "../../lib/admin/users";

// Integration — เปิด/ปิดบัญชีผู้ใช้ (Owner Decision 2026-07-31 #R6-C)
// รันเฉพาะ local dev DB · fixtures prefix test-activation- ลบทิ้งใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  admin: "test-activation-admin@test.invalid",
  admin2: "test-activation-admin2@test.invalid",
  soleAdmin: "test-activation-sole@test.invalid",
  worker: "test-activation-worker@test.invalid",
  pending: "test-activation-pending@test.invalid",
} as const;

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  const uids = users.map((u) => u.id);
  if (uids.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { OR: [{ userId: { in: uids } }, { entityId: { in: uids } }] },
    });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
}

describe.skipIf(!isLocalDevDb)("Integration: เปิด/ปิดบัญชีผู้ใช้", () => {
  let ctxAdmin: AuthorizationContext;
  let adminId = "";
  let admin2Id = "";
  let soleAdminId = "";
  let workerId = "";
  let pendingId = "";
  let communityId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    const community = await prisma.community.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (!community) throw new Error("ต้องมีชุมชน seed อย่างน้อย 1 แห่ง");
    communityId = community.id;

    const mk = async (
      email: string,
      role: UserRoleEnum,
      opts: { isActive?: boolean; registration?: RegistrationRequestStatus } = {},
    ) => {
      const u = await prisma.user.create({
        data: { email, name: `Activation ${email}`, isActive: opts.isActive ?? true },
      });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      if (opts.registration) {
        await prisma.registrationRequest.create({
          data: { userId: u.id, requestedRole: role, status: opts.registration },
        });
      }
      return u;
    };

    const admin = await mk(EMAILS.admin, UserRoleEnum.ADMIN);
    const admin2 = await mk(EMAILS.admin2, UserRoleEnum.ADMIN);
    const soleAdmin = await mk(EMAILS.soleAdmin, UserRoleEnum.ADMIN);
    const worker = await mk(EMAILS.worker, UserRoleEnum.DATA_ENTRY, {
      registration: RegistrationRequestStatus.APPROVED,
    });
    const pending = await mk(EMAILS.pending, UserRoleEnum.DATA_ENTRY, {
      isActive: false,
      registration: RegistrationRequestStatus.PENDING,
    });

    adminId = admin.id;
    admin2Id = admin2.id;
    soleAdminId = soleAdmin.id;
    workerId = worker.id;
    pendingId = pending.id;

    // ผูกชุมชนให้ worker — ใช้ตรวจว่าปิด/เปิดบัญชีแล้ว scope ไม่หาย
    await prisma.userCommunityScope.create({
      data: { userId: worker.id, communityId },
    });

    ctxAdmin = await loadContextOrThrow({
      id: admin.id,
      name: admin.name,
      email: admin.email,
    });
  });

  beforeEach(async () => {
    // คืนสถานะ worker เป็นเปิดใช้งานก่อนทุกเทสต์ ให้แต่ละเทสต์เป็นอิสระ
    await prisma.user.update({ where: { id: workerId }, data: { isActive: true } });
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("1) ADMIN ปิดบัญชีผู้ใช้ทั่วไปได้", async () => {
    const result = await setUserActive(ctxAdmin, workerId, false);
    expect(result).toEqual({ ok: true, isActive: false, changed: true });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: workerId } });
    expect(after.isActive).toBe(false);
  });

  it("2) ADMIN เปิดบัญชีผู้ใช้กลับได้", async () => {
    await setUserActive(ctxAdmin, workerId, false);
    const result = await setUserActive(ctxAdmin, workerId, true);
    expect(result).toEqual({ ok: true, isActive: true, changed: true });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: workerId } });
    expect(after.isActive).toBe(true);
  });

  it("3) ผู้ไม่มี user.manage ทำไม่ได้ → NOT_ALLOWED (ตรวจฝั่ง server)", async () => {
    const powerless: AuthorizationContext = {
      ...ctxAdmin,
      userId: "synthetic-no-permission",
      permissions: [],
    };
    const result = await setUserActive(powerless, workerId, false);
    expect(result).toEqual({ ok: false, reason: "NOT_ALLOWED" });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: workerId } });
    expect(after.isActive).toBe(true); // ไม่ถูกเปลี่ยนจริง
  });

  it("4) ADMIN ปิดบัญชีตัวเองไม่ได้ → SELF_DEACTIVATION", async () => {
    const result = await setUserActive(ctxAdmin, adminId, false);
    expect(result).toEqual({ ok: false, reason: "SELF_DEACTIVATION" });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(after.isActive).toBe(true);
  });

  it("5) ปิด Active ADMIN คนสุดท้ายไม่ได้ → LAST_ACTIVE_ADMIN", async () => {
    // ปิด ADMIN อื่นทั้งหมดชั่วคราว เหลือ soleAdmin เป็น active admin คนเดียวจริง
    const others = await prisma.userRole.findMany({
      where: { role: UserRoleEnum.ADMIN, isActive: true, userId: { not: soleAdminId } },
      select: { userId: true },
    });
    const otherIds = others.map((r) => r.userId);
    await prisma.user.updateMany({
      where: { id: { in: otherIds } },
      data: { isActive: false },
    });

    try {
      // ctx ของผู้กระทำต้องไม่ใช่ soleAdmin เอง (ไม่งั้นชน SELF_DEACTIVATION ก่อน)
      const managerCtx: AuthorizationContext = {
        ...ctxAdmin,
        userId: "synthetic-manager",
        permissions: [PERMISSIONS.USER_MANAGE],
      };
      const result = await setUserActive(managerCtx, soleAdminId, false);
      expect(result).toEqual({ ok: false, reason: "LAST_ACTIVE_ADMIN" });

      const after = await prisma.user.findUniqueOrThrow({ where: { id: soleAdminId } });
      expect(after.isActive).toBe(true);
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: otherIds } },
        data: { isActive: true },
      });
    }
  });

  it("6) ปิด ADMIN ได้ เมื่อยังมี Active ADMIN คนอื่น", async () => {
    const result = await setUserActive(ctxAdmin, admin2Id, false);
    expect(result).toEqual({ ok: true, isActive: false, changed: true });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: admin2Id } });
    expect(after.isActive).toBe(false);

    await setUserActive(ctxAdmin, admin2Id, true); // คืนสภาพ
  });

  it("7) การปิดบัญชีสร้าง Audit Log ค่าก่อน/หลัง", async () => {
    await setUserActive(ctxAdmin, workerId, false);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: workerId },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log?.userId).toBe(adminId); // ใครเป็นคนสั่ง
    expect(log?.action).toBe(AuditAction.UPDATE);
    expect(log?.createdAt).toBeInstanceOf(Date); // เมื่อใด
    expect(log?.changes).toMatchObject({
      field: "isActive",
      before: true,
      after: false,
    });
  });

  it("8) การเปิดบัญชีสร้าง Audit Log ค่าก่อน/หลัง", async () => {
    await setUserActive(ctxAdmin, workerId, false);
    await setUserActive(ctxAdmin, workerId, true);

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "User", entityId: workerId },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.changes).toMatchObject({
      field: "isActive",
      before: false,
      after: true,
    });
    // ห้ามมีข้อมูลอ่อนไหวใน Audit
    const serialized = JSON.stringify(log?.changes ?? {});
    expect(serialized).not.toContain("@test.invalid");
    expect(serialized).not.toContain("token");
  });

  it("9) Role และ Community Scope ไม่เปลี่ยนหลังปิดแล้วเปิด", async () => {
    const before = {
      roles: (
        await prisma.userRole.findMany({
          where: { userId: workerId },
          select: { role: true, isActive: true },
          orderBy: { role: "asc" },
        })
      ).map((r) => `${r.role}:${r.isActive}`),
      scopes: (
        await prisma.userCommunityScope.findMany({
          where: { userId: workerId },
          select: { communityId: true },
          orderBy: { communityId: "asc" },
        })
      ).map((s) => s.communityId),
    };

    await setUserActive(ctxAdmin, workerId, false);
    await setUserActive(ctxAdmin, workerId, true);

    const after = {
      roles: (
        await prisma.userRole.findMany({
          where: { userId: workerId },
          select: { role: true, isActive: true },
          orderBy: { role: "asc" },
        })
      ).map((r) => `${r.role}:${r.isActive}`),
      scopes: (
        await prisma.userCommunityScope.findMany({
          where: { userId: workerId },
          select: { communityId: true },
          orderBy: { communityId: "asc" },
        })
      ).map((s) => s.communityId),
    };

    expect(after).toEqual(before);

    // สิทธิ์ที่คำนวณได้ต้องกลับมาเท่าเดิมพอดี
    const u = await prisma.user.findUniqueOrThrow({ where: { id: workerId } });
    const ctx = await loadContextOrThrow({ id: u.id, name: u.name, email: u.email });
    expect(ctx.permissions).toContain(PERMISSIONS.SURVEY_ENTRY);
    expect(ctx.communityIds).toEqual([communityId]);
  });

  it("10) สั่งค่าเดิมซ้ำ → ไม่เปลี่ยนอะไร และไม่เขียน Audit ซ้ำ", async () => {
    await setUserActive(ctxAdmin, workerId, false);
    const countBefore = await prisma.auditLog.count({
      where: { entityType: "User", entityId: workerId },
    });

    const again = await setUserActive(ctxAdmin, workerId, false);
    expect(again).toEqual({ ok: true, isActive: false, changed: false });

    const countAfter = await prisma.auditLog.count({
      where: { entityType: "User", entityId: workerId },
    });
    expect(countAfter).toBe(countBefore);
  });

  it("11) บัญชีที่ถูกปิด: Session เดิมไม่ถูกลบ แต่ถูกตัดสิทธิ์ด้วยการตรวจ isActive รายคำขอ", async () => {
    // สร้าง Session ค้างไว้เหมือนผู้ใช้เปิดหน้าจอทิ้งไว้
    const session = await prisma.session.create({
      data: {
        userId: workerId,
        token: `test-activation-token-${Date.now()}`,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    await setUserActive(ctxAdmin, workerId, false);

    // พฤติกรรมจริงที่ต้องบันทึกไว้: ระบบ **ไม่มี** การ revoke session
    // แถว session ยังอยู่ และคุกกี้เดิมยังถอดรหัสได้
    const stillThere = await prisma.session.findUnique({ where: { id: session.id } });
    expect(stillThere).not.toBeNull();

    // สิ่งที่ตัดสิทธิ์จริงคือเงื่อนไขเดียวกับที่ getActiveSessionUser ใช้
    // (lib/auth-session.ts อ่าน isActive จาก DB ทุกคำขอ ไม่เชื่อคุกกี้)
    const gate = await prisma.user.findUnique({
      where: { id: workerId },
      select: { isActive: true },
    });
    expect(gate?.isActive).toBe(false); // → getActiveSessionUser คืน null ในคำขอถัดไป

    await prisma.session.delete({ where: { id: session.id } });
  });

  it("11b) บัญชีที่ถูกปิด โหลด Authorization Context ไม่ได้ → null", async () => {
    await setUserActive(ctxAdmin, workerId, false);

    // เดิม loadAuthorizationForUser คำนวณสิทธิ์จาก Role/Scope อย่างเดียว ไม่ตรวจ isActive
    // ทำให้โค้ดใหม่ที่เรียกตรงโดยข้าม getActiveSessionUser() เปิดช่องให้บัญชีที่ถูกปิด
    // ทำงานต่อได้เงียบ ๆ — ตอนนี้ตัวโหลดตรวจเองแล้ว จึงไม่ต้องพึ่งวินัยของ caller
    const u = await prisma.user.findUniqueOrThrow({ where: { id: workerId } });
    const ctx = await loadAuthorizationForUser({
      id: u.id,
      name: u.name,
      email: u.email,
    });
    expect(ctx).toBeNull();

    // เปิดกลับแล้วต้องได้สิทธิ์เดิมคืนครบ
    await setUserActive(ctxAdmin, workerId, true);
    const restored = await loadAuthorizationForUser({
      id: u.id,
      name: u.name,
      email: u.email,
    });
    expect(restored?.permissions).toContain(PERMISSIONS.SURVEY_ENTRY);
    expect(restored?.communityIds).toEqual([communityId]);
  });

  it("12) บัญชีรออนุมัติ เปิดตรง ๆ ไม่ได้ → NOT_TOGGLEABLE (ต้องผ่านการอนุมัติ)", async () => {
    const result = await setUserActive(ctxAdmin, pendingId, true);
    expect(result).toEqual({ ok: false, reason: "NOT_TOGGLEABLE" });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: pendingId } });
    expect(after.isActive).toBe(false);
  });

  it("13) หน้าจัดการผู้ใช้แยก 'รออนุมัติ' ออกจาก 'ปิดใช้งาน'", async () => {
    await setUserActive(ctxAdmin, workerId, false);
    const rows = await listUsers(ctxAdmin);

    const pending = rows.find((r) => r.id === pendingId);
    const deactivated = rows.find((r) => r.id === workerId);
    const admin = rows.find((r) => r.id === adminId);

    expect(pending?.accountStatus).toBe("PENDING_APPROVAL");
    expect(deactivated?.accountStatus).toBe("DEACTIVATED");
    expect(admin?.accountStatus).toBe("ACTIVE");
    // ทั้งคู่ isActive=false เหมือนกัน แต่ต้องไม่ถูกแสดงเหมือนกัน
    expect(pending?.isActive).toBe(false);
    expect(deactivated?.isActive).toBe(false);
    expect(pending?.accountStatus).not.toBe(deactivated?.accountStatus);
  });

  // --- Concurrency: write skew ของ invariant "ต้องมี Active ADMIN >= 1" ----

  it("15) แอดมินสองคนสั่งปิดกันเองพร้อมกัน → ต้องเหลือ Active ADMIN อย่างน้อย 1", async () => {
    // เหลือ adminA (ctxAdmin) กับ admin2 เป็น Active ADMIN สองคนเท่านั้นในระบบ
    const others = await prisma.userRole.findMany({
      where: {
        role: UserRoleEnum.ADMIN,
        isActive: true,
        userId: { notIn: [adminId, admin2Id] },
      },
      select: { userId: true },
    });
    const otherIds = others.map((r) => r.userId);
    await prisma.user.updateMany({
      where: { id: { in: otherIds } },
      data: { isActive: false },
    });
    await prisma.user.updateMany({
      where: { id: { in: [adminId, admin2Id] } },
      data: { isActive: true },
    });

    const auditBefore = await prisma.auditLog.count({
      where: { entityType: "User", entityId: { in: [adminId, admin2Id] } },
    });

    try {
      const ctxAdmin2 = await loadContextOrThrow({
        id: admin2Id,
        name: `Activation ${EMAILS.admin2}`,
        email: EMAILS.admin2,
      });

      // ยิงพร้อมกันจริง — ต่างฝ่ายต่างสั่งปิดบัญชีของอีกฝ่าย
      // ถ้าไม่มีการ serialize ทั้งคู่จะนับเห็นว่า "อีกฝ่ายยัง active" แล้วผ่าน guard
      // ทั้งคู่ (write skew) เพราะเขียนคนละแถว เงื่อนไข where บนแถวเป้าหมายช่วยไม่ได้
      const [r1, r2] = await Promise.all([
        setUserActive(ctxAdmin, admin2Id, false),
        setUserActive(ctxAdmin2, adminId, false),
      ]);

      const activeAdmins = await prisma.userRole.count({
        where: { role: UserRoleEnum.ADMIN, isActive: true, user: { isActive: true } },
      });
      expect(activeAdmins).toBeGreaterThanOrEqual(1); // invariant หลัก

      // หนึ่งสำเร็จ หนึ่งถูกปฏิเสธด้วยเหตุผลโดเมนที่ถูกต้อง
      const results = [r1, r2];
      const succeeded = results.filter((r) => r.ok);
      const rejected = results.filter((r) => !r.ok);
      expect(succeeded.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(rejected[0]).toEqual({ ok: false, reason: "LAST_ACTIVE_ADMIN" });

      // Audit ต้องเกิดเฉพาะรายการที่สำเร็จ — คำขอที่ถูกปฏิเสธห้ามทิ้งร่องรอยการเปลี่ยนแปลง
      const auditAfter = await prisma.auditLog.count({
        where: { entityType: "User", entityId: { in: [adminId, admin2Id] } },
      });
      expect(auditAfter).toBe(auditBefore + 1);
    } finally {
      await prisma.user.updateMany({
        where: { id: { in: [...otherIds, adminId, admin2Id] } },
        data: { isActive: true },
      });
    }
  });

  it("16) ถอด Role และปิดบัญชีต้อง serialize ด้วยล็อกเดียวกัน (คนละเส้นทาง invariant เดียวกัน)", async () => {
    const others = await prisma.userRole.findMany({
      where: {
        role: UserRoleEnum.ADMIN,
        isActive: true,
        userId: { notIn: [adminId, admin2Id] },
      },
      select: { userId: true },
    });
    const otherIds = others.map((r) => r.userId);
    await prisma.user.updateMany({
      where: { id: { in: otherIds } },
      data: { isActive: false },
    });
    await prisma.user.updateMany({
      where: { id: { in: [adminId, admin2Id] } },
      data: { isActive: true },
    });

    try {
      const ctxAdmin2 = await loadContextOrThrow({
        id: admin2Id,
        name: `Activation ${EMAILS.admin2}`,
        email: EMAILS.admin2,
      });

      // A ปิดบัญชีของ B พร้อมกับ B ถอด Role ADMIN ของ A
      // ถ้าสองเส้นทางใช้ล็อกคนละตัว (หรือไม่ล็อก) ระบบจะไม่เหลือแอดมิน
      const [byActive, byRole] = await Promise.all([
        setUserActive(ctxAdmin, admin2Id, false),
        setUserRoles(ctxAdmin2, adminId, [UserRoleEnum.OFFICER]),
      ]);

      const activeAdmins = await prisma.userRole.count({
        where: { role: UserRoleEnum.ADMIN, isActive: true, user: { isActive: true } },
      });
      expect(activeAdmins).toBeGreaterThanOrEqual(1);

      const okCount = [byActive, byRole].filter((r) => r.ok).length;
      expect(okCount).toBe(1); // สำเร็จได้ทางเดียวเท่านั้น
    } finally {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: adminId, role: UserRoleEnum.ADMIN } },
        create: { userId: adminId, role: UserRoleEnum.ADMIN },
        update: { isActive: true },
      });
      await prisma.userRole.updateMany({
        where: { userId: adminId, role: UserRoleEnum.OFFICER },
        data: { isActive: false },
      });
      await prisma.user.updateMany({
        where: { id: { in: [...otherIds, adminId, admin2Id] } },
        data: { isActive: true },
      });
    }
  });

  it("14) ไม่พบผู้ใช้ → USER_NOT_FOUND", async () => {
    const result = await setUserActive(ctxAdmin, "no-such-user-id", false);
    expect(result).toEqual({ ok: false, reason: "USER_NOT_FOUND" });
  });
});
