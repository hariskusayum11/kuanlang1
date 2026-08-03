import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
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
    adminCtx = await loadContextOrThrow(sessionUser(admin));
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // Community Scope ถูกยกเลิกทั้งระบบ (Owner Decision 2026-08-03 #R7-B)
  // เทสต์ชุดนี้จึงเปลี่ยนจาก "พิสูจน์ว่าจำกัดขอบเขตได้" เป็น "พิสูจน์ว่าไม่จำกัดแล้วจริง"
  // และธง hasGlobalCommunityScope ที่ยังอยู่ในฐานข้อมูลต้องไม่มีผลต่อการตัดสินสิทธิ์

  it("1) ทุกบัญชีเห็นทุกชุมชน ไม่ว่าจะผูก UserCommunityScope ไว้อย่างไร", async () => {
    const [g, s, n] = await Promise.all(
      [globalId, scopedId, noScopeId].map(async (id) => {
        const u = await prisma.user.findUniqueOrThrow({ where: { id } });
        return loadContextOrThrow(sessionUser(u));
      }),
    );
    for (const ctx of [g, s, n]) {
      expect(ctx.isGlobalScope).toBe(true);
      const cov = await fetchCommunityCoverage({
        isGlobalScope: ctx.isGlobalScope,
        communityIds: ctx.communityIds,
      });
      expect(cov.rows.length).toBe(communityIds.length);
    }
  });

  it("2) แถว UserCommunityScope ยังถูกโหลดมาใน context แต่ไม่ได้ใช้จำกัดสิทธิ์แล้ว", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: scopedId } });
    const ctx = await loadContextOrThrow(sessionUser(u));
    // ข้อมูลยังอยู่ครบ (เปิด scope กลับได้โดยไม่ต้อง migrate)
    expect(ctx.communityIds).toEqual([communityIds[0]]);
    // แต่ผลลัพธ์ที่เห็นคือทั้งระบบ ไม่ใช่แค่ชุมชนที่ผูกไว้
    expect(ctx.isGlobalScope).toBe(true);
  });

  it("3) ผู้ที่ไม่ได้ผูกชุมชนเลย ก็ยังเห็นครบ — ไม่ตกไปเป็น 0 พื้นที่", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: noScopeId } });
    const ctx = await loadContextOrThrow(sessionUser(u));
    expect(ctx.communityIds).toEqual([]);
    const cov = await fetchCommunityCoverage({
      isGlobalScope: ctx.isGlobalScope,
      communityIds: ctx.communityIds,
    });
    expect(cov.rows.length).toBe(communityIds.length);
  });

  it("11) Global Scope แก้ได้เฉพาะผู้มี user.manage — OFFICER แก้ไม่ได้", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: scopedId } });
    const officerCtx = await loadContextOrThrow(sessionUser(u));
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
    const ctx = await loadContextOrThrow(sessionUser(u));
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
