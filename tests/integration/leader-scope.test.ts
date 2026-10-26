import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { scopedCommunityIds } from "../../lib/authz/access";
import { entryPayloadSchema } from "../../lib/entry/payload";
import { submitEntry } from "../../lib/entry/save";
import { startSheet } from "../../lib/sheet/create";
import { verifyHousehold } from "../../lib/verification/review";
import { fetchScopedDashboardCounts } from "../../lib/dashboard/get-dashboard-stats";
import { fetchCommunityCoverage } from "../../lib/dashboard/get-coverage";
import { fetchQuestionnaireAnalytics } from "../../lib/dashboard/questionnaire-analytics";
import { listCommunities } from "../../lib/community/core";
import { getHouseholdLayerMap } from "../../lib/geo/household-layer-map";
import { getCommunityMapSummaries } from "../../lib/geo/community-map-summary";
import { getCurrentCommunityBoundaries } from "../../lib/geo/community-boundaries";
import { getImportantSites } from "../../lib/geo/important-sites";
import { getHelpPriority } from "../../lib/risk/help-priority";
import { getVerifiedHouseholds } from "../../lib/household/list";
import { loadHouseholdForReview } from "../../lib/verification/review";
import { getRiskList } from "../../lib/risk/list";
import { getExecutiveReport } from "../../lib/report/executive-summary";
import { listCommunityVolunteers } from "../../lib/community-volunteers/core";
import { getKeyring } from "../../lib/crypto/keys";
import { deleteImportantSite, saveImportantSite } from "../../lib/geo/important-sites";
import { updatePopulation } from "../../lib/community/core";
import { getShelterOverview } from "../../lib/shelters/core";

// Integration — หัวหน้าชุมชนเห็นแดชบอร์ด/ชุมชน/แผนที่ เฉพาะชุมชนที่ผูกไว้ (Owner Decision 2026-10-19 · docs/41)
// ---------------------------------------------------------------------------
// เรียกทุกแหล่งข้อมูลที่หน้า /dashboard /communities /map ใช้ ด้วย context ของหัวหน้าชุมชน A
// แล้วตรวจว่าไม่มี id / ชื่อ / บ้านเลขที่ / จุดสำคัญของชุมชน B หลุดออกมาแม้แต่ตัวเดียว
// (รวมการขอชุมชน B ตรง ๆ ผ่านตัวกรอง URL) · หัวหน้าที่ไม่ผูกชุมชนต้องไม่เห็นอะไรเลย
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  keyer: "test-lscope-keyer@test.invalid",
  officer: "test-lscope-officer@test.invalid",
  leader: "test-lscope-leader@test.invalid",
  orphan: "test-lscope-orphan@test.invalid",
} as const;
const CODES = ["TLSA", "TLSB"] as const;
const NAME_A = "ชุมชนทดสอบหัวหน้าเอ";
const NAME_B = "ชุมชนทดสอบหัวหน้าบี";
const HOUSE_A = "71/1";
const HOUSE_B = "72/9";
const SITE_A = "จุดทดสอบหัวหน้าเอ";
const SITE_B = "จุดทดสอบหัวหน้าบี";

const square = (lng: number, lat: number) => ({
  type: "Polygon",
  coordinates: [[[lng, lat], [lng + 0.01, lat], [lng + 0.01, lat + 0.01], [lng, lat + 0.01], [lng, lat]]],
});

async function cleanup() {
  const communities = await prisma.community.findMany({ where: { code: { in: [...CODES] } }, select: { id: true } });
  const communityIds = communities.map((c) => c.id);
  if (communityIds.length > 0) {
    const ids = (await prisma.household.findMany({ where: { communityId: { in: communityIds } }, select: { id: true } })).map((h) => h.id);
    if (ids.length > 0) {
      await prisma.householdVersion.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.assistanceNeed.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.personVulnerability.deleteMany({ where: { person: { householdId: { in: ids } } } });
      await prisma.vulnerablePerson.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.floodRiskProfile.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.household.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.fieldStatus.deleteMany({ where: { sheet: { communityId: { in: communityIds } } } });
    await prisma.entryAttempt.deleteMany({ where: { sheet: { communityId: { in: communityIds } } } });
    await prisma.paperSheet.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.userCommunityScope.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.evacuationSite.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.$executeRaw(Prisma.sql`DELETE FROM community_boundary WHERE "communityId" IN (${Prisma.join(communityIds)})`);
  }
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAILS) } }, select: { id: true } });
  if (users.length > 0) await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: { in: [...CODES] } } });
}

describe.skipIf(!isLocalDevDb)("Integration: ขอบเขตของหัวหน้าชุมชน — แดชบอร์ด/ชุมชน/แผนที่ (docs/41)", () => {
  let ctxKeyer: AuthorizationContext;
  let ctxOfficer: AuthorizationContext;
  let ctxLeader: AuthorizationContext;
  let ctxOrphan: AuthorizationContext;
  let cA = "";
  let cB = "";
  let typeId = "";

  async function verifiedHousehold(communityId: string, houseNo: string, lat: number, lng: number) {
    const started = await startSheet(ctxKeyer, { communityId });
    if (!started.ok) throw new Error("startSheet failed");
    const payload = entryPayloadSchema.parse({
      answers: { houseNo, memberCount: 2, hasVulnerable: true },
      vulnerableRows: [{ prefix: "", firstName: "ทดสอบ", lastName: houseNo, age: "80", phone: "", vulnerabilities: [typeId], details: {} }],
    });
    const submitted = await submitEntry(ctxKeyer, started.sheetId, payload);
    if (!submitted.ok) throw new Error(`submitEntry failed: ${submitted.reason}`);
    await prisma.household.update({ where: { id: submitted.householdId }, data: { latitude: lat, longitude: lng } });
    const verified = await verifyHousehold(ctxOfficer, submitted.householdId);
    if (!verified.ok) throw new Error("verify failed");
    return submitted.householdId;
  }

  /** ข้อความที่ห้ามปรากฏในผลลัพธ์ใด ๆ ของหัวหน้าชุมชน A */
  const leaksB = (value: unknown) => {
    const s = JSON.stringify(value);
    return [cB, NAME_B, HOUSE_B, SITE_B, CODES[1]].filter((needle) => s.includes(needle));
  };

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const [a, b, type] = await Promise.all([
      prisma.community.create({ data: { code: CODES[0], nameTh: NAME_A, totalHouseholds: 10 } }),
      prisma.community.create({ data: { code: CODES[1], nameTh: NAME_B, totalHouseholds: 10 } }),
      prisma.vulnerabilityType.findFirstOrThrow({ where: { code: "BEDRIDDEN" }, select: { id: true } }),
    ]);
    cA = a.id;
    cB = b.id;
    typeId = type.id;

    const mkUser = async (email: string, role: UserRoleEnum) => {
      const u = await prisma.user.create({ data: { email, name: `Fixture ${email}` } });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return u;
    };
    const [keyer, officer, leader, orphan] = await Promise.all([
      mkUser(EMAILS.keyer, UserRoleEnum.DATA_ENTRY),
      mkUser(EMAILS.officer, UserRoleEnum.OFFICER),
      mkUser(EMAILS.leader, UserRoleEnum.COMMUNITY_LEADER),
      mkUser(EMAILS.orphan, UserRoleEnum.COMMUNITY_LEADER),
    ]);
    await prisma.userCommunityScope.create({ data: { userId: leader.id, communityId: cA } });
    // ธงเดิมค้างเป็น true — ต้องไม่ทำให้หัวหน้าชุมชนกลายเป็นทั้งระบบ
    await prisma.user.update({ where: { id: orphan.id }, data: { hasGlobalCommunityScope: true } });

    [ctxKeyer, ctxOfficer, ctxLeader, ctxOrphan] = await Promise.all(
      [keyer, officer, leader, orphan].map((u) => loadContextOrThrow({ id: u.id, name: u.name, email: u.email })),
    );

    await verifiedHousehold(cA, HOUSE_A, 7.011, 100.451);
    await verifiedHousehold(cB, HOUSE_B, 7.021, 100.461);
    await prisma.evacuationSite.createMany({
      data: [
        { communityId: cA, name: SITE_A, latitude: 7.012, longitude: 100.452 },
        { communityId: cB, name: SITE_B, latitude: 7.022, longitude: 100.462 },
      ],
    });
    for (const [id, lng, lat] of [[cA, 100.45, 7.01], [cB, 100.46, 7.02]] as const) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO community_boundary ("id", "communityId", "version", "geom", "source", "isApproved", "effectiveFrom", "effectiveTo", "createdAt")
        VALUES (${randomUUID()}, ${id}, 1, ST_Multi(ST_GeomFromGeoJSON(${JSON.stringify(square(lng, lat))}))::geography,
          'integration-test', FALSE, now(), NULL, now())
      `);
    }
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("context: หัวหน้าชุมชนไม่ใช่ทั้งระบบ · ขอบเขต = ชุมชนที่ผูก · บทบาทอื่นยังทั้งระบบ", () => {
    expect(ctxLeader.isGlobalScope).toBe(false);
    expect(ctxLeader.communityIds).toEqual([cA]);
    expect(ctxOrphan.isGlobalScope).toBe(false);
    expect(ctxOrphan.communityIds).toEqual([]);
    expect(ctxOfficer.isGlobalScope).toBe(true);
    expect(ctxKeyer.isGlobalScope).toBe(true);
  });

  it("แดชบอร์ด: การ์ด ความครอบคลุม ภาพรวมแบบสอบถาม ตัวเลือกชุมชน และตารางเปรียบเทียบ — มีแต่ชุมชน A", async () => {
    const counts = await fetchScopedDashboardCounts(ctxLeader);
    expect(counts.communities).toBe(1);
    expect(counts.verified).toBe(1);
    expect(counts.keyed).toBe(1);

    const coverage = await fetchCommunityCoverage(ctxLeader);
    expect(coverage.rows.map((r) => r.communityId)).toEqual([cA]);

    for (const status of ["VERIFIED", "PENDING", "ALL"] as const) {
      const analytics = await fetchQuestionnaireAnalytics(ctxLeader, { status });
      expect(analytics.options.communities.map((c) => c.id)).toEqual([cA]);
      expect(analytics.byCommunity.every((r) => r.communityId === cA)).toBe(true);
      expect(leaksB(analytics)).toEqual([]);
    }
    const all = await fetchQuestionnaireAnalytics(ctxLeader, { status: "ALL" });
    expect(all.summary.households).toBe(1);
    expect(all.summary.vulnerablePeople).toBe(1);

    // ขอชุมชน B ตรง ๆ ผ่านตัวกรอง URL → ว่าง ไม่ใช่ข้อมูล B
    const sneaky = await fetchQuestionnaireAnalytics(ctxLeader, { status: "ALL", communityId: cB });
    expect(sneaky.summary.households).toBe(0);
    expect(sneaky.byCommunity).toEqual([]);

    expect(leaksB([counts, coverage])).toEqual([]);
  });

  it("หน้าชุมชน: เห็นเฉพาะชุมชน A", async () => {
    const result = await listCommunities(ctxLeader);
    expect(result.allowed).toBe(true);
    expect(result.communities.map((c) => c.id)).toEqual([cA]);
    expect(leaksB(result)).toEqual([]);
  });

  it("แผนที่: จุดรายบ้าน กล่องสรุปชุมชน ขอบเขต จุดสำคัญ ตัวเลือก ลำดับช่วยเหลือ — เฉพาะชุมชน A", async () => {
    const map = await getHouseholdLayerMap(ctxLeader, {});
    // เจ้าของอนุญาตให้หัวหน้าชุมชนเห็นจุดรายบ้านของชุมชนตน
    expect(map.points.map((p) => p.houseNo)).toEqual([HOUSE_A]);
    expect(map.options.communities.map((c) => c.id)).toEqual([cA]);
    expect(leaksB(map)).toEqual([]);

    const sneakyMap = await getHouseholdLayerMap(ctxLeader, { communityId: cB });
    expect(sneakyMap.points).toEqual([]);
    expect(leaksB(sneakyMap)).toEqual([]);

    const summaries = await getCommunityMapSummaries(ctxLeader);
    expect(Object.keys(summaries.summaries)).toEqual([cA]);
    expect(leaksB(summaries)).toEqual([]);

    const boundaries = await getCurrentCommunityBoundaries({ communityIds: scopedCommunityIds(ctxLeader) });
    expect(boundaries.map((b) => b.communityId)).toEqual([cA]);

    const sites = await getImportantSites(ctxLeader);
    expect(sites.map((s) => s.name)).toEqual([SITE_A]);
    expect(await getImportantSites(ctxLeader, cB)).toEqual([]);

    // ?help=on — หัวหน้าชุมชนมี household.view แล้ว (docs/43) แต่ต้องเห็นแค่ชุมชน A
    const help = await getHelpPriority(ctxLeader, {});
    expect(help?.cases.length).toBe(1);
    expect(leaksB(help)).toEqual([]);
    expect((await getHelpPriority(ctxLeader, { communityId: cB }))?.cases).toEqual([]);
  });

  it("แอดมินชุมชน (docs/43): ครัวเรือน ใบเต็ม ความเสี่ยง รายงาน บ้านพักพิง อาสา จุดสำคัญ ประชากร — เฉพาะชุมชน A", async () => {
    const list = await getVerifiedHouseholds(ctxLeader, {});
    expect(list.rows.map((r) => r.houseNo)).toEqual([HOUSE_A]);
    expect(leaksB(list)).toEqual([]);
    expect((await getVerifiedHouseholds(ctxLeader, { communityId: cB })).rows).toEqual([]);

    // เปิดใบเต็มได้เฉพาะชุมชน A · ใบชุมชน B ตอบเหมือนไม่มี (กัน IDOR)
    const houseA = await prisma.household.findFirstOrThrow({ where: { communityId: cA }, select: { id: true } });
    const houseB = await prisma.household.findFirstOrThrow({ where: { communityId: cB }, select: { id: true } });
    const view = await loadHouseholdForReview(ctxLeader, houseA.id, { purpose: "view" });
    expect(view?.canConfirm).toBe(false);
    expect(view?.canResolveDuplicate).toBe(false);
    expect(await loadHouseholdForReview(ctxLeader, houseB.id, { purpose: "view" })).toBeNull();
    // ไม่มีสิทธิ์ตรวจ → โหมดตรวจเปิดไม่ได้เลย
    expect(await loadHouseholdForReview(ctxLeader, houseA.id)).toBeNull();

    const risk = await getRiskList(ctxLeader);
    expect(risk.rows.map((r) => r.householdId)).toEqual([houseA.id]);

    const report = await getExecutiveReport(ctxLeader, { status: "VERIFIED" });
    expect(report?.summary.households).toBe(1);
    expect(leaksB(report)).toEqual([]);

    const volunteers = await listCommunityVolunteers(ctxLeader, getKeyring());
    expect(volunteers).not.toBeNull();
    expect(leaksB(volunteers)).toEqual([]);

    // จุดสำคัญ: เพิ่มในชุมชน A ได้ · ชุมชน B ไม่ได้ · แก้/ลบจุดของ B ไม่ได้
    const siteInput = { name: "จุดทดสอบหัวหน้าเพิ่มเอง", type: "SCHOOL", latitude: 7.013, longitude: 100.453 };
    expect((await saveImportantSite(ctxLeader, { ...siteInput, communityId: cA })).ok).toBe(true);
    expect((await saveImportantSite(ctxLeader, { ...siteInput, communityId: cB })).ok).toBe(false);
    const siteB = await prisma.evacuationSite.findFirstOrThrow({ where: { name: SITE_B }, select: { id: true } });
    expect((await saveImportantSite(ctxLeader, { ...siteInput, id: siteB.id, communityId: cA })).ok).toBe(false);
    expect((await deleteImportantSite(ctxLeader, siteB.id)).ok).toBe(false);

    // ประชากร: แก้จำนวนครัวเรือนชุมชน A ได้ แต่เป้า % คงเดิม · ชุมชน B ไม่ได้
    expect(await updatePopulation(ctxLeader, cA, { totalHouseholds: 321, targetCoveragePercent: 10 })).toEqual({ ok: true });
    const a = await prisma.community.findUniqueOrThrow({ where: { id: cA }, select: { totalHouseholds: true, targetCoveragePercent: true } });
    expect(a.totalHouseholds).toBe(321);
    expect(Number(a.targetCoveragePercent)).toBe(60);
    expect((await updatePopulation(ctxLeader, cB, { totalHouseholds: 1, targetCoveragePercent: 60 })).ok).toBe(false);

    // บ้านพักพิง: รายการเฉพาะชุมชน A
    const shelters = await getShelterOverview(ctxLeader);
    expect(leaksB(shelters)).toEqual([]);
  });

  it("หัวหน้าชุมชนที่ยังไม่ผูกชุมชน → ไม่เห็นอะไรเลย (ไม่ fallback เป็นทั้งระบบ)", async () => {
    const counts = await fetchScopedDashboardCounts(ctxOrphan);
    expect(counts.communities).toBe(0);
    expect(counts.keyed).toBe(0);
    expect((await fetchCommunityCoverage(ctxOrphan)).rows).toEqual([]);
    const analytics = await fetchQuestionnaireAnalytics(ctxOrphan, { status: "ALL" });
    expect(analytics.summary.households).toBe(0);
    expect(analytics.options.communities).toEqual([]);
    expect((await listCommunities(ctxOrphan)).communities).toEqual([]);
    const map = await getHouseholdLayerMap(ctxOrphan, {});
    expect(map.points).toEqual([]);
    expect(map.options.communities).toEqual([]);
    expect((await getCommunityMapSummaries(ctxOrphan)).summaries).toEqual({});
    expect(await getCurrentCommunityBoundaries({ communityIds: scopedCommunityIds(ctxOrphan) })).toEqual([]);
    expect(await getImportantSites(ctxOrphan)).toEqual([]);
  });

  it("เจ้าหน้าที่ (ทั้งระบบ) ยังเห็นทั้งสองชุมชน — #R7-B ไม่เปลี่ยน", async () => {
    const map = await getHouseholdLayerMap(ctxOfficer, {});
    const houses = map.points.map((p) => p.houseNo);
    expect(houses).toContain(HOUSE_A);
    expect(houses).toContain(HOUSE_B);
    const sites = (await getImportantSites(ctxOfficer)).map((s) => s.name);
    expect(sites).toEqual(expect.arrayContaining([SITE_A, SITE_B]));
  });
});
