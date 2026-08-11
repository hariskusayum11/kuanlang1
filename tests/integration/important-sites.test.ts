import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient, UserRoleEnum } from "@prisma/client";
import { buildAuthorization } from "../../lib/authz/access";
import type { AuthorizationContext } from "../../lib/authz/types";
import { deleteImportantSite, getImportantSites, saveImportantSite } from "../../lib/geo/important-sites";
import { getHouseholdLayerMap } from "../../lib/geo/household-layer-map";

const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
const prisma = new PrismaClient();
const email = "test-map-sites@test.invalid";
const communityCode = "TMAPSITE";

describe.skipIf(!isLocalDevDb)("Integration: important map sites", () => {
  let ctx: AuthorizationContext;
  let communityId = "";

  async function cleanup() {
    const community = await prisma.community.findUnique({ where: { code: communityCode }, select: { id: true } });
    if (community) await prisma.evacuationSite.deleteMany({ where: { communityId: community.id } });
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { email } });
    await prisma.community.deleteMany({ where: { code: communityCode } });
  }

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const community = await prisma.community.create({ data: { code: communityCode, nameTh: "ชุมชนทดสอบแผนที่" } });
    const user = await prisma.user.create({ data: { email, name: "Map Admin" } });
    communityId = community.id;
    ctx = {
      userId: user.id,
      name: user.name,
      email: user.email,
      roles: [UserRoleEnum.ADMIN],
      permissions: buildAuthorization([UserRoleEnum.ADMIN]).permissions,
      isGlobalScope: true,
      communityIds: [],
    };
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("เพิ่ม แก้ไข อ่าน และลบจุดสำคัญพร้อม Audit ได้", async () => {
    expect(await saveImportantSite(ctx, {
      communityId, name: "โรงเรียนทดสอบ", type: "SCHOOL",
      latitude: 7.01, longitude: 100.42, capacity: 120,
    })).toEqual({ ok: true });

    const created = (await getImportantSites(communityId))[0];
    expect(created).toEqual(expect.objectContaining({ name: "โรงเรียนทดสอบ", capacity: 120 }));

    expect(await saveImportantSite(ctx, {
      id: created.id, communityId, name: "ศูนย์อพยพทดสอบ", type: "COMMUNITY_CENTER",
      latitude: 7.02, longitude: 100.43, capacity: 200,
    })).toEqual({ ok: true });
    expect((await getImportantSites(communityId))[0].name).toBe("ศูนย์อพยพทดสอบ");

    expect(await deleteImportantSite(ctx, created.id)).toEqual({ ok: true });
    expect(await getImportantSites(communityId)).toEqual([]);
    expect(await prisma.auditLog.count({ where: { userId: ctx.userId, entityType: "EvacuationSite" } })).toBe(3);
  });

  it("ส่งรายการทักษะอาสาสมัครบนแผนที่ครบตาม master แบบสอบถาม", async () => {
    const map = await getHouseholdLayerMap(ctx, {});
    const codes = map.options.volunteerSkills.map((skill) => skill.code);
    expect(codes).toEqual(expect.arrayContaining([
      "EARLY_WARNING", "RESCUE", "KITCHEN", "ELDERLY_CARE",
      "RECOVERY", "MECHANIC", "ELECTRICIAN", "CONSTRUCTION",
    ]));
  });
});
