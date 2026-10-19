import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { entryPayloadSchema } from "../../lib/entry/payload";
import { submitEntry } from "../../lib/entry/save";
import { startSheet } from "../../lib/sheet/create";
import { verifyHousehold } from "../../lib/verification/review";
import { getShelterOverview, revokeHostShelter, updateHostShelter, verifyHostShelter } from "../../lib/shelters/core";
import { getPublicMapData, getPublicStats } from "../../lib/public/stats";
import { deleteImportantSite } from "../../lib/geo/important-sites";
import { getHouseholdLayerMap } from "../../lib/geo/household-layer-map";

// Integration — ยืนยันบ้านพักพิง (Owner Decision 2026-10-19 · docs/38)
//   1. ติ๊กยินยอมในแบบสอบถาม = เสนอตัว ยังไม่เป็นจุดพักพิง
//   2. ต้องติดต่อเจ้าของ + ใบตรวจแล้ว + มีพิกัด จึงยืนยันได้
//   3. ไม่ยินยอมเผยแพร่ → ไม่ปรากฏบนหน้าสาธารณะเลย (แผนที่ + ตัวนับ)
//   4. ยืนยันซ้ำไม่ได้ · ยกเลิกแล้วกลับไปรอยืนยัน · ตัวแก้จุดสำคัญทั่วไปแตะไม่ได้
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
const prisma = new PrismaClient();
const EMAILS = { keyer: "test-shelter-keyer@test.invalid", officer: "test-shelter-officer@test.invalid", admin: "test-shelter-admin@test.invalid", leader: "test-shelter-leader@test.invalid" } as const;
const CODE = "TSH1";

async function cleanup() {
  const community = await prisma.community.findFirst({ where: { code: CODE }, select: { id: true } });
  if (community) {
    await prisma.evacuationSite.deleteMany({ where: { communityId: community.id } });
    const ids = (await prisma.household.findMany({ where: { communityId: community.id }, select: { id: true } })).map((h) => h.id);
    if (ids.length) {
      await prisma.householdVersion.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.floodRiskProfile.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.household.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.fieldStatus.deleteMany({ where: { sheet: { communityId: community.id } } });
    await prisma.entryAttempt.deleteMany({ where: { sheet: { communityId: community.id } } });
    await prisma.paperSheet.deleteMany({ where: { communityId: community.id } });
  }
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAILS) } }, select: { id: true } });
  if (users.length) await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: CODE } });
}

describe.skipIf(!isLocalDevDb)("Integration: ยืนยันบ้านพักพิง (docs/38)", () => {
  let keyer: AuthorizationContext;
  let officer: AuthorizationContext;
  let admin: AuthorizationContext;
  let leader: AuthorizationContext;
  let communityId = "";

  async function hostHousehold(houseNo: string, withCoordinates = true) {
    const started = await startSheet(keyer, { communityId });
    if (!started.ok) throw new Error("startSheet failed");
    const payload = entryPayloadSchema.parse({
      answers: {
        houseNo,
        memberCount: 3,
        hasVulnerable: false,
        canBeHostHouse: true,
        ...(withCoordinates ? { latitudeText: "6.99", longitudeText: "100.44" } : {}),
      },
    });
    const submitted = await submitEntry(keyer, started.sheetId, payload);
    if (!submitted.ok) throw new Error(`submit failed: ${submitted.reason}`);
    expect((await verifyHousehold(officer, submitted.householdId)).ok).toBe(true);
    return submitted.householdId;
  }

  const fields = { name: "บ้านพักพิงทดสอบ", capacity: 8, hasToilet: true, hasKitchen: false, hasPowerBackup: false, isAccessibleForDisabled: false };

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    communityId = (await prisma.community.create({ data: { code: CODE, nameTh: "ชุมชนทดสอบพักพิง" } })).id;
    const mk = async (email: string, role: UserRoleEnum) => {
      const u = await prisma.user.create({ data: { email, name: `Fixture ${email}` } });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return loadContextOrThrow({ id: u.id, name: u.name, email: u.email });
    };
    keyer = await mk(EMAILS.keyer, UserRoleEnum.DATA_ENTRY);
    officer = await mk(EMAILS.officer, UserRoleEnum.OFFICER);
    admin = await mk(EMAILS.admin, UserRoleEnum.ADMIN);
    leader = await mk(EMAILS.leader, UserRoleEnum.COMMUNITY_LEADER);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("1) ติ๊กยินยอม = รอยืนยัน · ต้องติดต่อเจ้าของก่อน · ไม่มีพิกัดยืนยันไม่ได้ · บทบาทอื่นไม่มีสิทธิ์", async () => {
    const householdId = await hostHousehold("1/1");
    const noCoords = await hostHousehold("1/2", false);
    const overview = await getShelterOverview(officer);
    expect(overview?.candidates.map((c) => c.householdId)).toEqual(expect.arrayContaining([householdId, noCoords]));
    expect(overview?.candidates.find((c) => c.householdId === noCoords)?.hasCoordinates).toBe(false);

    expect((await verifyHostShelter(officer, { ...fields, householdId, isPublic: false, ownerContacted: false })).ok).toBe(false);
    expect(await verifyHostShelter(officer, { ...fields, householdId: noCoords, isPublic: false, ownerContacted: true })).toEqual({ ok: false, reason: "NO_COORDINATES" });
    expect(await verifyHostShelter(leader, { ...fields, householdId, isPublic: false, ownerContacted: true })).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(await getShelterOverview(keyer)).toBeNull();
  });

  it("2) ยืนยันแบบไม่ยินยอมเผยแพร่ → อยู่หลังบ้าน ไม่หลุดหน้าสาธารณะ · ยืนยันซ้ำไม่ได้ · ชั้น 'เสนอตัว' บนแผนที่หายไป", async () => {
    const householdId = await hostHousehold("2/1");
    const publicBefore = (await getPublicStats()).evacuationSites;

    const result = await verifyHostShelter(officer, { ...fields, householdId, isPublic: false, ownerContacted: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const site = await prisma.evacuationSite.findUniqueOrThrow({ where: { id: result.siteId } });
    expect(site).toMatchObject({ type: "RELATIVE_HOME", isPublic: false, isActive: true, sourceHouseholdId: householdId, verifiedById: officer.userId, capacity: 8 });

    const map = await getPublicMapData();
    expect(map.sites.some((s) => s.id === result.siteId)).toBe(false);
    expect((await getPublicStats()).evacuationSites).toBe(publicBefore);

    expect(await verifyHostShelter(admin, { ...fields, householdId, isPublic: true, ownerContacted: true })).toEqual({ ok: false, reason: "ALREADY_VERIFIED" });

    const layer = await getHouseholdLayerMap(admin, { communityId });
    expect(layer.points.some((p) => p.id === householdId && p.potentialHostHouse)).toBe(false);
    expect((await getShelterOverview(officer))?.candidates.some((c) => c.householdId === householdId)).toBe(false);

    // ยินยอมเผยแพร่ภายหลัง → ขึ้นหน้าสาธารณะ
    expect((await updateHostShelter(officer, { ...fields, siteId: result.siteId, isPublic: true })).ok).toBe(true);
    expect((await getPublicMapData()).sites.some((s) => s.id === result.siteId)).toBe(true);
    expect((await getPublicStats()).evacuationSites).toBe(publicBefore + 1);
  });

  it("3) ตัวแก้จุดสำคัญทั่วไปลบ/แก้บ้านพักพิงไม่ได้ · ยกเลิกแล้วกลับไปรอยืนยันและยืนยันใหม่ได้", async () => {
    const householdId = await hostHousehold("3/1");
    const verified = await verifyHostShelter(officer, { ...fields, householdId, isPublic: true, ownerContacted: true });
    if (!verified.ok) throw new Error("verify failed");

    const del = await deleteImportantSite(admin, verified.siteId);
    expect(del.ok).toBe(false);
    expect(await prisma.evacuationSite.count({ where: { id: verified.siteId } })).toBe(1);

    expect((await revokeHostShelter(officer, verified.siteId)).ok).toBe(true);
    const revoked = await prisma.evacuationSite.findUniqueOrThrow({ where: { id: verified.siteId } });
    expect(revoked).toMatchObject({ isActive: false, isPublic: false });
    expect((await getShelterOverview(officer))?.candidates.some((c) => c.householdId === householdId)).toBe(true);

    const again = await verifyHostShelter(officer, { ...fields, householdId, isPublic: false, ownerContacted: true });
    expect(again).toEqual({ ok: true, siteId: verified.siteId });
  });
});
