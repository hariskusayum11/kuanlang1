import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient, UserRoleEnum } from "@prisma/client";
import {
  migrateLegacyRoles,
  verifyMigration,
} from "../../lib/admin/migrate-legacy-roles";
import { loadContextOrThrow } from "../helpers/authz";
import { PERMISSIONS } from "../../lib/authz/permissions";

// Integration — Data Migration ย้ายบทบาทเดิมเข้า OFFICER (Owner Decision #R6-D)
// รันจริงบน PostgreSQL · fixtures prefix test-migrole- ลบทิ้งใน afterAll
//
// หมายเหตุสำคัญ: Dev DB ปัจจุบันมีบทบาทเดิม 0 บัญชี migration จึงเป็น no-op ที่นั่น
// เทสต์ชุดนี้จึง **สร้างข้อมูลเดิมขึ้นมาเองทุกรูปแบบ** เพื่อพิสูจน์ตรรกะการแปลงจริง
// ไม่ใช่พิสูจน์แค่ว่า "รันแล้วไม่ error"
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  coordOnly: "test-migrole-coord@test.invalid",
  verifOnly: "test-migrole-verif@test.invalid",
  coordEntry: "test-migrole-coord-entry@test.invalid",
  verifCoord: "test-migrole-verif-coord@test.invalid",
  verifOfficer: "test-migrole-verif-officer@test.invalid",
  verifExec: "test-migrole-verif-exec@test.invalid",
  verifAlreadyGlobal: "test-migrole-verif-global@test.invalid",
  officerPlain: "test-migrole-officer@test.invalid",
  surveyor: "test-migrole-surveyor@test.invalid",
  volunteer: "test-migrole-volunteer@test.invalid",
  researcher: "test-migrole-researcher@test.invalid",
  admin: "test-migrole-admin@test.invalid",
} as const;
const COMMUNITY_CODE = "TMR1";

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: COMMUNITY_CODE } });
}

/** id ของ fixture — ประกาศไว้ระดับ describe เพื่อใช้ข้ามเทสต์ */
const ids: Record<keyof typeof EMAILS, string> = {} as Record<
  keyof typeof EMAILS,
  string
>;
let communityId = "";

async function seedFixtures() {
  const community = await prisma.community.upsert({
    where: { code: COMMUNITY_CODE },
    create: { code: COMMUNITY_CODE, nameTh: "ชุมชนทดสอบย้ายบทบาท" },
    update: {},
  });
  communityId = community.id;

  const mk = async (
    key: keyof typeof EMAILS,
    roles: UserRoleEnum[],
    opts: { global?: boolean; scoped?: boolean } = {},
  ) => {
    const u = await prisma.user.create({
      data: {
        email: EMAILS[key],
        name: `MigRole ${key}`,
        hasGlobalCommunityScope: opts.global ?? false,
      },
    });
    for (const role of roles) {
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
    }
    if (opts.scoped) {
      await prisma.userCommunityScope.create({
        data: { userId: u.id, communityId: community.id },
      });
    }
    ids[key] = u.id;
  };

  await mk("coordOnly", [UserRoleEnum.COORDINATOR], { scoped: true });
  await mk("verifOnly", [UserRoleEnum.VERIFIER], { scoped: true });
  await mk("coordEntry", [UserRoleEnum.COORDINATOR, UserRoleEnum.DATA_ENTRY]);
  await mk("verifCoord", [UserRoleEnum.VERIFIER, UserRoleEnum.COORDINATOR]);
  await mk("verifOfficer", [UserRoleEnum.VERIFIER, UserRoleEnum.OFFICER]);
  await mk("verifExec", [UserRoleEnum.VERIFIER, UserRoleEnum.EXECUTIVE]);
  await mk("verifAlreadyGlobal", [UserRoleEnum.VERIFIER], { global: true });
  await mk("officerPlain", [UserRoleEnum.OFFICER], { scoped: true });
  await mk("surveyor", [UserRoleEnum.FIELD_SURVEYOR]);
  await mk("volunteer", [UserRoleEnum.VOLUNTEER]);
  await mk("researcher", [UserRoleEnum.RESEARCHER]);
  await mk("admin", [UserRoleEnum.ADMIN]);
}

async function activeRolesOf(key: keyof typeof EMAILS): Promise<UserRoleEnum[]> {
  const rows = await prisma.userRole.findMany({
    where: { userId: ids[key], isActive: true },
    select: { role: true },
  });
  return rows.map((r) => r.role).sort();
}

async function globalFlagOf(key: keyof typeof EMAILS): Promise<boolean> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: ids[key] } });
  return u.hasGlobalCommunityScope;
}

describe.skipIf(!isLocalDevDb)("Integration: ย้ายบทบาทเดิมเข้า OFFICER", () => {
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

  it("dry-run รายงานจำนวนได้ถูกต้องโดยไม่เขียนข้อมูล", async () => {
    const before = await activeRolesOf("coordOnly");
    const result = await migrateLegacyRoles(prisma, { dryRun: true });

    expect(result.dryRun).toBe(true);
    // coordOnly · verifOnly · coordEntry · verifCoord · verifOfficer · verifExec
    // · verifAlreadyGlobal = 7 บัญชีที่ถือบทบาทเดิม
    expect(result.legacyUsers).toBe(7);
    expect(result.usersWithCoordinator).toBe(3); // coordOnly coordEntry verifCoord
    expect(result.usersWithVerifier).toBe(5); // verifOnly verifCoord verifOfficer verifExec verifAlreadyGlobal
    expect(result.officerAlreadyPresent).toBe(1); // verifOfficer มี OFFICER อยู่แล้ว
    expect(result.officerRolesGranted).toBe(6);
    expect(result.globalScopeGranted).toBe(4); // verifAlreadyGlobal ไม่ถูกนับ

    expect(await activeRolesOf("coordOnly")).toEqual(before); // ไม่เขียนจริง
    const check = await verifyMigration(prisma);
    expect(check.ok).toBe(false); // ยังไม่ได้ย้าย — ยืนยันว่า dry-run ไม่แตะข้อมูล
  });

  it("1) COORDINATOR ถูกเปลี่ยนเป็น OFFICER", async () => {
    await migrateLegacyRoles(prisma);
    expect(await activeRolesOf("coordOnly")).toEqual([UserRoleEnum.OFFICER]);
  });

  it("2-3) VERIFIER ถูกเปลี่ยนเป็น OFFICER และได้ Global Scope", async () => {
    await migrateLegacyRoles(prisma);
    expect(await activeRolesOf("verifOnly")).toEqual([UserRoleEnum.OFFICER]);
    expect(await globalFlagOf("verifOnly")).toBe(true);
  });

  it("4) COORDINATOR ไม่ได้ Global Scope เพิ่ม", async () => {
    await migrateLegacyRoles(prisma);
    expect(await globalFlagOf("coordOnly")).toBe(false);
    expect(await globalFlagOf("coordEntry")).toBe(false);
  });

  it("5) ผู้ใช้ที่มี DATA_ENTRY ยังคง DATA_ENTRY", async () => {
    await migrateLegacyRoles(prisma);
    expect(await activeRolesOf("coordEntry")).toEqual(
      [UserRoleEnum.DATA_ENTRY, UserRoleEnum.OFFICER].sort(),
    );
  });

  it("6) ผู้ใช้ที่มี EXECUTIVE ยังคง EXECUTIVE (+ ได้ Global จาก VERIFIER)", async () => {
    await migrateLegacyRoles(prisma);
    expect(await activeRolesOf("verifExec")).toEqual(
      [UserRoleEnum.EXECUTIVE, UserRoleEnum.OFFICER].sort(),
    );
    expect(await globalFlagOf("verifExec")).toBe(true);
  });

  it("7) Role ซ้ำไม่เกิด — ทั้งกรณี [VERIFIER, COORDINATOR] และ [VERIFIER, OFFICER]", async () => {
    await migrateLegacyRoles(prisma);

    const vc = await activeRolesOf("verifCoord");
    expect(vc).toEqual([UserRoleEnum.OFFICER]);
    expect(vc.length).toBe(new Set(vc).size);

    const vo = await activeRolesOf("verifOfficer");
    expect(vo).toEqual([UserRoleEnum.OFFICER]);
    // แถวในตารางต้องมี OFFICER เพียงแถวเดียว (@@unique([userId, role]))
    const officerRows = await prisma.userRole.count({
      where: { userId: ids.verifOfficer, role: UserRoleEnum.OFFICER },
    });
    expect(officerRows).toBe(1);
  });

  it("8) รัน Migration ซ้ำแล้วผลไม่เปลี่ยน (idempotent)", async () => {
    const first = await migrateLegacyRoles(prisma);
    expect(first.noop).toBe(false);

    const snapshot = await Promise.all(
      (Object.keys(EMAILS) as (keyof typeof EMAILS)[]).map(async (k) => ({
        k,
        roles: await activeRolesOf(k),
        global: await globalFlagOf(k),
      })),
    );

    const second = await migrateLegacyRoles(prisma);
    expect(second.noop).toBe(true);
    expect(second.legacyUsers).toBe(0);

    const after = await Promise.all(
      (Object.keys(EMAILS) as (keyof typeof EMAILS)[]).map(async (k) => ({
        k,
        roles: await activeRolesOf(k),
        global: await globalFlagOf(k),
      })),
    );
    expect(after).toEqual(snapshot);
  });

  it("9-10) FIELD_SURVEYOR / VOLUNTEER / RESEARCHER ไม่ถูกแก้", async () => {
    await migrateLegacyRoles(prisma);
    expect(await activeRolesOf("surveyor")).toEqual([UserRoleEnum.FIELD_SURVEYOR]);
    expect(await activeRolesOf("volunteer")).toEqual([UserRoleEnum.VOLUNTEER]);
    expect(await activeRolesOf("researcher")).toEqual([UserRoleEnum.RESEARCHER]);
    expect(await globalFlagOf("surveyor")).toBe(false);
    expect(await globalFlagOf("volunteer")).toBe(false);
    expect(await globalFlagOf("researcher")).toBe(false);
  });

  it("11) Community Scope เดิมยังอยู่ครบ ไม่ถูกลบหรือเพิ่ม", async () => {
    const beforeCoord = await prisma.userCommunityScope.count({
      where: { userId: ids.coordOnly },
    });
    const beforeVerif = await prisma.userCommunityScope.count({
      where: { userId: ids.verifOnly },
    });

    await migrateLegacyRoles(prisma);

    expect(
      await prisma.userCommunityScope.count({ where: { userId: ids.coordOnly } }),
    ).toBe(beforeCoord);
    // VERIFIER ได้ธง global แต่ scope เดิม "ไม่ต้องลบ" ตามคำตัดสิน
    expect(
      await prisma.userCommunityScope.count({ where: { userId: ids.verifOnly } }),
    ).toBe(beforeVerif);
  });

  it("12) หลัง Migration Authorization Context ถูกต้อง", async () => {
    await migrateLegacyRoles(prisma);

    const coord = await prisma.user.findUniqueOrThrow({ where: { id: ids.coordOnly } });
    const coordCtx = await loadContextOrThrow(coord);
    expect(coordCtx.roles).toEqual([UserRoleEnum.OFFICER]);
    expect(coordCtx.permissions).toContain(PERMISSIONS.BATCH_MANAGE);
    expect(coordCtx.permissions).toContain(PERMISSIONS.VERIFICATION_VIEW);
    expect(coordCtx.isGlobalScope).toBe(false); // COORDINATOR เดิมยังผูกชุมชน
    expect(coordCtx.communityIds).toEqual([communityId]);

    const verif = await prisma.user.findUniqueOrThrow({ where: { id: ids.verifOnly } });
    const verifCtx = await loadContextOrThrow(verif);
    expect(verifCtx.roles).toEqual([UserRoleEnum.OFFICER]);
    // เห็นทุกชุมชนได้เหมือนเดิม แต่มาจากธงรายบัญชี ไม่ใช่ชื่อ Role
    expect(verifCtx.isGlobalScope).toBe(true);
  });

  it("13) OFFICER เดิมไม่ถูกเปิด Global Scope", async () => {
    await migrateLegacyRoles(prisma);
    expect(await activeRolesOf("officerPlain")).toEqual([UserRoleEnum.OFFICER]);
    expect(await globalFlagOf("officerPlain")).toBe(false);
  });

  it("14) ADMIN behavior ไม่เปลี่ยน", async () => {
    await migrateLegacyRoles(prisma);
    expect(await activeRolesOf("admin")).toEqual([UserRoleEnum.ADMIN]);
    expect(await globalFlagOf("admin")).toBe(false); // ADMIN เป็น global จาก Role อยู่แล้ว

    const admin = await prisma.user.findUniqueOrThrow({ where: { id: ids.admin } });
    const ctx = await loadContextOrThrow(admin);
    expect(ctx.isGlobalScope).toBe(true);
    expect(ctx.permissions).toContain(PERMISSIONS.USER_MANAGE);
  });

  it("15) จำนวนบทบาทเดิมที่ใช้งานอยู่หลัง Migration = 0", async () => {
    await migrateLegacyRoles(prisma);
    const check = await verifyMigration(prisma);
    expect(check).toEqual({ activeCoordinator: 0, activeVerifier: 0, ok: true });
  });

  it("VERIFIER ที่มีธง global อยู่แล้ว ไม่ถูกนับซ้ำและค่าไม่เปลี่ยน", async () => {
    const result = await migrateLegacyRoles(prisma);
    expect(await globalFlagOf("verifAlreadyGlobal")).toBe(true);
    // นับเฉพาะรายที่ "เปลี่ยนจริง" — verifAlreadyGlobal ต้องไม่ถูกนับ
    // verifOnly / verifCoord / verifOfficer / verifExec = 4 ราย
    expect(result.globalScopeGranted).toBe(4);
  });

  it("แถวบทบาทเดิมถูกปิดใช้งาน ไม่ถูกลบทิ้ง (เป็นหลักฐานสำหรับย้อนกลับด้วยมือ)", async () => {
    await migrateLegacyRoles(prisma);
    const kept = await prisma.userRole.count({
      where: {
        userId: ids.verifOnly,
        role: UserRoleEnum.VERIFIER,
        isActive: false,
      },
    });
    expect(kept).toBe(1);
  });
});
