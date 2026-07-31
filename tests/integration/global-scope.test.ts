import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadAuthorizationForUser } from "../../lib/authz/load-authorization";
import { setUserGlobalScope, listUsers } from "../../lib/admin/users";
import { fetchCommunityCoverage } from "../../lib/dashboard/get-coverage";
import type { AuthorizationContext } from "../../lib/authz/types";

// Integration — Global Community Scope ระดับบัญชี (Owner Decision 2026-07-31 #R6-A)
// รันเฉพาะ local dev DB · fixtures prefix test-gscope- ลบทิ้งใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  officerScoped: "test-gscope-scoped@test.invalid",
  officerGlobal: "test-gscope-global@test.invalid",
  officerNoScope: "test-gscope-noscope@test.invalid",
  admin: "test-gscope-admin@test.invalid",
} as const;

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
}

function sessionUser(u: { id: string; name: string; email: string }) {
  return { id: u.id, name: u.name, email: u.email };
}

describe.skipIf(!isLocalDevDb)("Integration: Global Community Scope ระดับบัญชี", () => {
  let scopedId = "";
  let globalId = "";
  let noScopeId = "";
  let adminCtx: AuthorizationContext;
  let communityIds: string[] = [];

  beforeAll(async () => {
    await cleanup();
    const communities = await prisma.community.findMany({
      where: { deletedAt: null },
      select: { id: true },
      orderBy: { code: "asc" },
    });
    communityIds = communities.map((c) => c.id);
    if (communityIds.length < 2) throw new Error("ต้องมีชุมชน seed อย่างน้อย 2 แห่ง");

    const mk = async (email: string, role: UserRoleEnum, global = false) => {
      const u = await prisma.user.create({
        data: { email, name: `GScope ${email}`, hasGlobalCommunityScope: global },
      });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return u;
    };

    const scoped = await mk(EMAILS.officerScoped, UserRoleEnum.OFFICER);
    await prisma.userCommunityScope.create({
      data: { userId: scoped.id, communityId: communityIds[0] },
    });
    scopedId = scoped.id;

    const global = await mk(EMAILS.officerGlobal, UserRoleEnum.OFFICER, true);
    globalId = global.id;

    const noScope = await mk(EMAILS.officerNoScope, UserRoleEnum.OFFICER);
    noScopeId = noScope.id;

    const admin = await mk(EMAILS.admin, UserRoleEnum.ADMIN);
    adminCtx = await loadAuthorizationForUser(sessionUser(admin));
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("1) OFFICER ที่มี Community Scope เห็นเฉพาะพื้นที่ของตน", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: scopedId } });
    const ctx = await loadAuthorizationForUser(sessionUser(u));
    expect(ctx.isGlobalScope).toBe(false);
    expect(ctx.communityIds).toEqual([communityIds[0]]);

    const cov = await fetchCommunityCoverage({
      isGlobalScope: ctx.isGlobalScope,
      communityIds: ctx.communityIds,
    });
    expect(cov.rows.length).toBe(1);
    expect(cov.rows[0].communityId).toBe(communityIds[0]);
  });

  it("2) OFFICER ที่เป็น Global เห็นทุกพื้นที่ แม้ไม่ได้ผูก UserCommunityScope เลย", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: globalId } });
    const ctx = await loadAuthorizationForUser(sessionUser(u));
    expect(ctx.isGlobalScope).toBe(true);
    expect(ctx.communityIds).toEqual([]); // ไม่ได้ผูกชุมชนใดเลย

    const cov = await fetchCommunityCoverage({
      isGlobalScope: ctx.isGlobalScope,
      communityIds: ctx.communityIds,
    });
    expect(cov.rows.length).toBe(communityIds.length);
  });

  it("3) OFFICER ที่ไม่มี Scope และไม่ Global เห็น 0 พื้นที่ (ห้าม fallback เป็นทั้งระบบ)", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: noScopeId } });
    const ctx = await loadAuthorizationForUser(sessionUser(u));
    expect(ctx.isGlobalScope).toBe(false);
    expect(ctx.communityIds).toEqual([]);

    const cov = await fetchCommunityCoverage({
      isGlobalScope: ctx.isGlobalScope,
      communityIds: ctx.communityIds,
    });
    expect(cov.rows.length).toBe(0);
  });

  it("4) OFFICER คนหนึ่งเป็น Global ไม่ทำให้ OFFICER คนอื่นเป็น Global", async () => {
    const [g, s, n] = await Promise.all(
      [globalId, scopedId, noScopeId].map(async (id) => {
        const u = await prisma.user.findUniqueOrThrow({ where: { id } });
        return loadAuthorizationForUser(sessionUser(u));
      }),
    );
    expect(g.isGlobalScope).toBe(true);
    expect(s.isGlobalScope).toBe(false);
    expect(n.isGlobalScope).toBe(false);
  });

  it("11) Global Scope แก้ได้เฉพาะผู้มี user.manage — OFFICER แก้ไม่ได้", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: scopedId } });
    const officerCtx = await loadAuthorizationForUser(sessionUser(u));
    const result = await setUserGlobalScope(officerCtx, noScopeId, true);
    expect(result).toEqual({ ok: false, reason: "NOT_ALLOWED" });

    // ยืนยันว่าไม่ถูกเปลี่ยนจริงในฐานข้อมูล
    const after = await prisma.user.findUniqueOrThrow({ where: { id: noScopeId } });
    expect(after.hasGlobalCommunityScope).toBe(false);
  });

  it("12) ผู้ใช้แก้ Global Scope ของตนเองไม่ได้ แม้มี user.manage", async () => {
    const result = await setUserGlobalScope(adminCtx, adminCtx.userId, true);
    expect(result).toEqual({ ok: false, reason: "SELF_SCOPE_CHANGE" });

    const after = await prisma.user.findUniqueOrThrow({ where: { id: adminCtx.userId } });
    expect(after.hasGlobalCommunityScope).toBe(false);
  });

  it("13) การเปลี่ยน Global Scope เขียน Audit Log ค่าก่อน/หลัง", async () => {
    const before = await prisma.auditLog.count({
      where: { entityType: "UserCommunityScope", entityId: noScopeId },
    });

    const result = await setUserGlobalScope(adminCtx, noScopeId, true);
    expect(result).toEqual({ ok: true, hasGlobalCommunityScope: true });

    const log = await prisma.auditLog.findFirst({
      where: { entityType: "UserCommunityScope", entityId: noScopeId },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log?.userId).toBe(adminCtx.userId);
    expect(log?.changes).toMatchObject({
      field: "hasGlobalCommunityScope",
      before: false,
      after: true,
    });

    const after = await prisma.auditLog.count({
      where: { entityType: "UserCommunityScope", entityId: noScopeId },
    });
    expect(after).toBe(before + 1);

    // มีผลทันทีในรอบ request ถัดไป โดยไม่ต้อง logout
    const u = await prisma.user.findUniqueOrThrow({ where: { id: noScopeId } });
    const ctx = await loadAuthorizationForUser(sessionUser(u));
    expect(ctx.isGlobalScope).toBe(true);
  });

  it("ตั้งค่าเดิมซ้ำ → ไม่เขียน Audit Log ซ้ำ (idempotent)", async () => {
    await setUserGlobalScope(adminCtx, noScopeId, true); // ตอนนี้เป็น true อยู่แล้ว
    const before = await prisma.auditLog.count({
      where: { entityType: "UserCommunityScope", entityId: noScopeId },
    });
    const result = await setUserGlobalScope(adminCtx, noScopeId, true);
    expect(result).toEqual({ ok: true, hasGlobalCommunityScope: true });
    const after = await prisma.auditLog.count({
      where: { entityType: "UserCommunityScope", entityId: noScopeId },
    });
    expect(after).toBe(before);
  });

  it("หน้าจัดการผู้ใช้แสดงธง Global ของแต่ละบัญชีถูกต้อง", async () => {
    const rows = await listUsers(adminCtx);
    const global = rows.find((r) => r.id === globalId);
    const scoped = rows.find((r) => r.id === scopedId);
    expect(global?.hasGlobalCommunityScope).toBe(true);
    expect(scoped?.hasGlobalCommunityScope).toBe(false);
  });
});
