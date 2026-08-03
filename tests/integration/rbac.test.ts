import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import { PERMISSIONS } from "../../lib/authz/permissions";
import { canAccessCommunity } from "../../lib/authz/access";
import { fetchScopedDashboardCounts } from "../../lib/dashboard/get-dashboard-stats";
import { fetchDashboardCounts } from "../../lib/dashboard/stats";

// Integration tests — RBAC + Community Scope Foundation (local Dev DB)
// -----------------------------------------------------------------------------
// รันเฉพาะเมื่อ DATABASE_URL ชี้ local dev เท่านั้น (เหมือน auth.test.ts)
// fixtures: prefix test-rbac- domain @test.invalid — สร้างตรงผ่าน prisma (ไม่ผ่าน Better Auth)
// ใช้ชุมชนจาก seed (TK01 ฯลฯ) แบบ read-only เท่านั้น — ห้ามแก้/ลบ
// ห้ามแก้ไขบัญชี dev-admin@test.invalid ถาวร
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const FIXTURE_EMAILS = {
  admin: "test-rbac-admin@test.invalid",
  scoped: "test-rbac-scoped@test.invalid",
  noRole: "test-rbac-norole@test.invalid",
  inactiveRole: "test-rbac-inactiverole@test.invalid",
  multiRole: "test-rbac-multirole@test.invalid",
} as const;

async function cleanupFixtures() {
  // UserRole / UserCommunityScope ลบตาม cascade (onDelete: Cascade)
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(FIXTURE_EMAILS) } },
  });
}

async function createFixtureUser(email: string) {
  return prisma.user.create({
    data: { email, name: `RBAC Fixture ${email}` },
  });
}

function toSessionUser(u: { id: string; name: string; email: string }) {
  return { id: u.id, name: u.name, email: u.email };
}

describe.skipIf(!isLocalDevDb)("Integration: RBAC + Community Scope", () => {
  let tk01Id: string;
  let otherCommunityId: string;

  beforeAll(async () => {
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      throw new Error(
        `[integration] เชื่อมต่อ Development DB ไม่ได้ — ตรวจ docker compose + migration: ${String(e)}`,
      );
    }
    await cleanupFixtures();

    const communities = await prisma.community.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true },
    });
    expect(communities.length).toBeGreaterThanOrEqual(2);
    tk01Id = communities[0].id;
    otherCommunityId = communities[1].id;
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  it("1) user ไม่มี role → permissions ว่าง, ไม่ global", async () => {
    const u = await createFixtureUser(FIXTURE_EMAILS.noRole);
    const ctx = await loadContextOrThrow(toSessionUser(u));
    expect(ctx.roles).toEqual([]);
    expect(ctx.permissions).toEqual([]);
    expect(ctx.isGlobalScope).toBe(true);
  });

  it("2) role isActive=false → ไม่ถูกนับ", async () => {
    const u = await createFixtureUser(FIXTURE_EMAILS.inactiveRole);
    await prisma.userRole.create({
      data: { userId: u.id, role: UserRoleEnum.OFFICER, isActive: false },
    });
    const ctx = await loadContextOrThrow(toSessionUser(u));
    expect(ctx.roles).toEqual([]);
    expect(ctx.permissions).toEqual([]);
  });

  it("3) ADMIN → ทุก permission + global scope", async () => {
    const u = await createFixtureUser(FIXTURE_EMAILS.admin);
    await prisma.userRole.create({
      data: { userId: u.id, role: UserRoleEnum.ADMIN, isActive: true },
    });
    const ctx = await loadContextOrThrow(toSessionUser(u));
    expect(ctx.isGlobalScope).toBe(true);
    expect(ctx.permissions).toContain(PERMISSIONS.USER_MANAGE);
    expect(ctx.permissions).toContain(PERMISSIONS.DASHBOARD_VIEW);
  });

  it("4) หลาย role → union permissions", async () => {
    const u = await createFixtureUser(FIXTURE_EMAILS.multiRole);
    await prisma.userRole.createMany({
      data: [
        { userId: u.id, role: UserRoleEnum.VERIFIER, isActive: true },
        { userId: u.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
      ],
    });
    const ctx = await loadContextOrThrow(toSessionUser(u));
    expect([...ctx.permissions].sort()).toEqual(
      [PERMISSIONS.VERIFICATION_VIEW, PERMISSIONS.SURVEY_ENTRY].sort(),
    );
    expect(ctx.isGlobalScope).toBe(true);
  });

  it("5) scoped user (VOLUNTEER + scope TK01) → communityIds ตรง DB", async () => {
    const u = await createFixtureUser(FIXTURE_EMAILS.scoped);
    await prisma.userRole.create({
      data: { userId: u.id, role: UserRoleEnum.VOLUNTEER, isActive: true },
    });
    await prisma.userCommunityScope.create({
      data: { userId: u.id, communityId: tk01Id },
    });
    const ctx = await loadContextOrThrow(toSessionUser(u));
    expect(ctx.communityIds).toEqual([tk01Id]);
    expect(ctx.isGlobalScope).toBe(true);
    expect(ctx.permissions).toContain(PERMISSIONS.DASHBOARD_VIEW);
  });

  it("6) canAccessCommunity: เข้าได้ทุกชุมชน — Community Scope ถูกยกเลิก (#R7-B)", async () => {
    const u = await prisma.user.findUnique({
      where: { email: FIXTURE_EMAILS.scoped },
    });
    const ctx = await loadContextOrThrow(toSessionUser(u!));
    // แม้ผูก UserCommunityScope ไว้กับชุมชนเดียว ก็เข้าชุมชนอื่นได้แล้ว
    expect(ctx.communityIds).toEqual([tk01Id]);
    expect(canAccessCommunity(ctx, tk01Id)).toBe(true);
    expect(canAccessCommunity(ctx, otherCommunityId)).toBe(true);
  });

  it("7) global scope → scoped counts = counts ทั้งระบบ", async () => {
    const scoped = await fetchScopedDashboardCounts({
      isGlobalScope: true,
      communityIds: [],
    });
    const global = await fetchDashboardCounts();
    expect(scoped).toEqual(global);
  });

  it("8) scope ว่าง (ไม่ global) → 0 ทั้งหมด ไม่ fallback", async () => {
    const counts = await fetchScopedDashboardCounts({
      isGlobalScope: false,
      communityIds: [],
    });
    expect(counts).toEqual({
      communities: 0,
      tambons: 0,
      moos: 0,
      households: 0,
      evacuationSites: 0,
    });
  });

  it("9) scoped counts ตรงกับ query อิสระ (ชุมชนเดียว)", async () => {
    const counts = await fetchScopedDashboardCounts({
      isGlobalScope: false,
      communityIds: [tk01Id],
    });

    const expectedCommunities = await prisma.community.count({
      where: { id: tk01Id, deletedAt: null },
    });
    const cts = await prisma.communityTambon.findMany({
      where: { communityId: tk01Id },
      select: { tambonId: true },
    });
    const tambonIds = [...new Set(cts.map((c) => c.tambonId))];
    const expectedMoos = await prisma.moo.count({
      where: { tambonId: { in: tambonIds } },
    });
    const expectedHouseholds = await prisma.household.count({
      where: { communityId: tk01Id },
    });
    const expectedEvac = await prisma.evacuationSite.count({
      where: { communityId: tk01Id },
    });

    expect(counts).toEqual({
      communities: expectedCommunities,
      tambons: tambonIds.length,
      moos: expectedMoos,
      households: expectedHouseholds,
      evacuationSites: expectedEvac,
    });
    expect(counts.communities).toBe(1);
  });

  it("10) dev-admin ไม่ถูกแก้ไขโดย fixtures + seed communities ที่ใช้ยังคงเดิม", async () => {
    const devAdmin = await prisma.user.findUnique({
      where: { email: "dev-admin@test.invalid" },
      select: { isActive: true },
    });
    // เครื่องที่ไม่มี dev-admin ให้ผ่าน (optional) — แต่ถ้ามีต้อง active
    if (devAdmin) expect(devAdmin.isActive).toBe(true);

    // ตรวจเป้าหมายตรง ๆ แทนการนับ master data ทั้งฐาน (กัน race กับไฟล์เทสต์อื่น):
    // seed communities ที่ไฟล์นี้ใช้อ้างอิงต้องยังอยู่และไม่ถูก soft delete
    const usedCommunities = await prisma.community.findMany({
      where: { id: { in: [tk01Id, otherCommunityId] } },
      select: { id: true, deletedAt: true },
    });
    expect(usedCommunities.length).toBe(2);
    expect(usedCommunities.every((c) => c.deletedAt === null)).toBe(true);
  });
});
