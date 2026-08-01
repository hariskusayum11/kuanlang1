import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  BatchStatus,
  PrismaClient,
  SheetStatus,
  UserRoleEnum,
} from "@prisma/client";
import { loadAuthorizationForUser } from "../../lib/authz/load-authorization";
import { loadContextOrThrow } from "../helpers/authz";
import { PERMISSIONS } from "../../lib/authz/permissions";
import type { AuthorizationContext } from "../../lib/authz/types";
import { encryptText } from "../../lib/crypto/encryption";
import { CURRENT_KEY_VERSION, getKeyring } from "../../lib/crypto/keys";
import { setUserRoles, setUserGlobalScope, listUsers } from "../../lib/admin/users";
import { listBatches } from "../../lib/batch/core";
import { getVerificationOverview } from "../../lib/verification/queue";
import { verifyHousehold } from "../../lib/verification/review";

// Integration — ยุบ COORDINATOR + VERIFIER เข้า OFFICER (Owner Decision #R6-D)
// รันเฉพาะ local dev DB · fixtures prefix test-officer- / TOM* ลบทิ้งใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  admin: "test-officer-admin@test.invalid",
  officer: "test-officer-o@test.invalid",
  legacyCoordinator: "test-officer-legacy-coord@test.invalid",
  legacyVerifier: "test-officer-legacy-verif@test.invalid",
  keyer: "test-officer-keyer@test.invalid",
} as const;
const COMMUNITY_CODE = "TOM1";
const BATCH_CODE = "BATCH-TOM-001";

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
    await prisma.auditLog.deleteMany({
      where: { OR: [{ userId: { in: uids } }, { entityId: { in: uids } }] },
    });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: COMMUNITY_CODE } });
}

describe.skipIf(!isLocalDevDb)("Integration: ยุบ COORDINATOR + VERIFIER เข้า OFFICER", () => {
  let ctxAdmin: AuthorizationContext;
  let ctxOfficer: AuthorizationContext;
  let officerId = "";
  let legacyCoordId = "";
  let legacyVerifId = "";
  let communityId = "";
  let hhByKeyer = "";
  let hhByOfficer = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    const community = await prisma.community.create({
      data: { code: COMMUNITY_CODE, nameTh: "ชุมชนทดสอบยุบบทบาท" },
    });
    communityId = community.id;

    const mk = async (email: string, roles: UserRoleEnum[], scoped = true) => {
      const u = await prisma.user.create({ data: { email, name: `Officer ${email}` } });
      for (const role of roles) {
        await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      }
      if (scoped) {
        await prisma.userCommunityScope.create({
          data: { userId: u.id, communityId: community.id },
        });
      }
      return u;
    };

    const admin = await mk(EMAILS.admin, [UserRoleEnum.ADMIN], false);
    const officer = await mk(EMAILS.officer, [UserRoleEnum.OFFICER]);
    const legacyCoord = await mk(EMAILS.legacyCoordinator, [UserRoleEnum.COORDINATOR]);
    const legacyVerif = await mk(EMAILS.legacyVerifier, [UserRoleEnum.VERIFIER]);
    const keyer = await mk(EMAILS.keyer, [UserRoleEnum.DATA_ENTRY]);

    officerId = officer.id;
    legacyCoordId = legacyCoord.id;
    legacyVerifId = legacyVerif.id;

    ctxAdmin = await loadContextOrThrow(admin);
    ctxOfficer = await loadContextOrThrow(officer);

    const batch = await prisma.paperBatch.create({
      data: {
        code: BATCH_CODE,
        communityId: community.id,
        expectedCount: 2,
        receivedAt: new Date(),
        receivedById: keyer.id,
        status: BatchStatus.IN_PROGRESS,
      },
    });

    const keyring = getKeyring();
    const mkHousehold = async (sheetNo: string, seq: number, enteredById: string) => {
      const sheet = await prisma.paperSheet.create({
        data: {
          communityId: community.id,
          batchId: batch.id,
          sheetNo,
          sequence: seq,
          status: SheetStatus.ENTERED_1,
        },
      });
      const h = await prisma.household.create({
        data: {
          sheetId: sheet.id,
          communityId: community.id,
          enteredById,
          respondentFirstName: encryptText("สมหญิง", keyring, CURRENT_KEY_VERSION),
          respondentLastName: encryptText("ทดสอบ", keyring, CURRENT_KEY_VERSION),
          houseNo: "2/2",
          hasVulnerable: false,
        },
      });
      return h.id;
    };
    hhByKeyer = await mkHousehold("TOM-940001", 1, keyer.id);
    hhByOfficer = await mkHousehold("TOM-940002", 2, officer.id);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // --- OFFICER ทำงานของทั้งสองบทบาทเดิมได้จริง ---------------------------

  it("11) OFFICER ใช้ Verification Queue ได้ (งานเดิมของ VERIFIER)", async () => {
    const overview = await getVerificationOverview(ctxOfficer);
    expect(overview.allowed).toBe(true);
    expect(overview.queue.some((q) => q.householdId === hhByKeyer)).toBe(true);
  });

  it("12) OFFICER ใช้ Batch flow ได้ (งานเดิมของ COORDINATOR)", async () => {
    const batches = await listBatches(ctxOfficer);
    expect(batches).not.toBeNull();
    expect(batches!.some((b) => b.code === BATCH_CODE)).toBe(true);
  });

  it("15) กฎ Self-verify ยังบังคับกับ OFFICER", async () => {
    // ใบที่ OFFICER คีย์เอง → ยืนยันเองไม่ได้
    expect(await verifyHousehold(ctxOfficer, hhByOfficer)).toEqual({
      ok: false,
      reason: "SELF_VERIFY",
    });
    const after = await prisma.household.findUniqueOrThrow({
      where: { id: hhByOfficer },
      select: { verifiedById: true },
    });
    expect(after.verifiedById).toBeNull();
  });

  it("OFFICER ยัง bound ด้วย Community Scope — ไม่เห็นข้ามชุมชน", async () => {
    expect(ctxOfficer.isGlobalScope).toBe(false);
    expect(ctxOfficer.communityIds).toEqual([communityId]);
  });

  it("4) เปิดธงรายบัญชีแล้ว OFFICER เห็นทุกชุมชน (ไม่ใช่จากชื่อ Role)", async () => {
    const result = await setUserGlobalScope(ctxAdmin, officerId, true);
    expect(result).toEqual({ ok: true, hasGlobalCommunityScope: true });
    try {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: officerId } });
      const ctx = await loadContextOrThrow(u);
      expect(ctx.isGlobalScope).toBe(true);
      // permission ต้องไม่เปลี่ยนจากการให้ scope
      expect([...ctx.permissions].sort()).toEqual([...ctxOfficer.permissions].sort());
    } finally {
      await setUserGlobalScope(ctxAdmin, officerId, false);
    }
  });

  // --- ห้ามมอบหมายบทบาทเดิมใหม่ ------------------------------------------

  it("7) Server Action ปฏิเสธ COORDINATOR แม้เรียกตรง (ไม่ผ่าน UI)", async () => {
    const result = await setUserRoles(ctxAdmin, officerId, [
      UserRoleEnum.OFFICER,
      UserRoleEnum.COORDINATOR,
    ]);
    expect(result).toEqual({ ok: false, reason: "LEGACY_ROLE_NOT_ASSIGNABLE" });

    const roles = await prisma.userRole.findMany({
      where: { userId: officerId, isActive: true },
      select: { role: true },
    });
    expect(roles.map((r) => r.role)).not.toContain(UserRoleEnum.COORDINATOR);
  });

  it("7b) Server Action ปฏิเสธ VERIFIER แม้เรียกตรง", async () => {
    const result = await setUserRoles(ctxAdmin, officerId, [
      UserRoleEnum.OFFICER,
      UserRoleEnum.VERIFIER,
    ]);
    expect(result).toEqual({ ok: false, reason: "LEGACY_ROLE_NOT_ASSIGNABLE" });

    const roles = await prisma.userRole.findMany({
      where: { userId: officerId, isActive: true },
      select: { role: true },
    });
    expect(roles.map((r) => r.role)).not.toContain(UserRoleEnum.VERIFIER);
  });

  // --- บัญชีเก่ายังใช้งานได้จนกว่าจะ migrate ------------------------------

  it("13) บัญชี COORDINATOR เดิมยังโหลด context ได้ พร้อมสิทธิ์เดิม", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: legacyCoordId } });
    const ctx = await loadAuthorizationForUser(u);
    expect(ctx).not.toBeNull();
    expect(ctx!.roles).toContain(UserRoleEnum.COORDINATOR);
    expect(ctx!.permissions).toContain(PERMISSIONS.BATCH_MANAGE);
    expect(ctx!.isGlobalScope).toBe(false);
  });

  it("13b) บัญชี VERIFIER เดิมยังโหลดได้ — แต่ไม่ได้ Global จากชื่อ Role อีกแล้ว", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: legacyVerifId } });
    const ctx = await loadAuthorizationForUser(u);
    expect(ctx).not.toBeNull();
    expect(ctx!.permissions).toContain(PERMISSIONS.VERIFICATION_VIEW);
    // พฤติกรรม "เห็นทุกชุมชน" ต้องมาจากธงรายบัญชีที่ Data Migration จะตั้งให้ (Commit ถัดไป)
    expect(ctx!.isGlobalScope).toBe(false);
  });

  it("บันทึกบทบาทอื่นให้บัญชีเก่า ต้องไม่ถอดบทบาทเดิมทิ้งโดยผลข้างเคียง", async () => {
    // ถ้าถอด VERIFIER ทิ้งเฉย ๆ ผู้ใช้จะเสียสิทธิ์เดิมเงียบ ๆ ก่อนที่ Migration
    // จะได้ตั้ง hasGlobalCommunityScope ให้ — ต้องคงไว้จนกว่าจะย้ายอย่างเป็นทางการ
    const result = await setUserRoles(ctxAdmin, legacyVerifId, [UserRoleEnum.OFFICER]);
    expect(result.ok).toBe(true);

    const roles = await prisma.userRole.findMany({
      where: { userId: legacyVerifId, isActive: true },
      select: { role: true },
    });
    const names = roles.map((r) => r.role);
    expect(names).toContain(UserRoleEnum.OFFICER); // บทบาทใหม่ถูกเพิ่ม
    expect(names).toContain(UserRoleEnum.VERIFIER); // บทบาทเดิมยังอยู่
    expect(names.length).toBe(new Set(names).size); // ห้ามซ้ำ
  });

  it("หน้าจัดการผู้ใช้ยังแสดงบทบาทเดิมของบัญชีเก่าได้ (ไม่หายไปจากสายตา)", async () => {
    const rows = await listUsers(ctxAdmin);
    const coord = rows.find((r) => r.id === legacyCoordId);
    expect(coord?.roles).toContain(UserRoleEnum.COORDINATOR);
  });

  it("14) พฤติกรรมของ ADMIN ไม่เปลี่ยนจากการยุบบทบาท", async () => {
    expect(ctxAdmin.isGlobalScope).toBe(true);
    expect(ctxAdmin.permissions).toContain(PERMISSIONS.USER_MANAGE);
    expect(ctxAdmin.permissions).toContain(PERMISSIONS.VERIFICATION_VIEW);
    expect(ctxAdmin.permissions).toContain(PERMISSIONS.BATCH_MANAGE);
  });
});
