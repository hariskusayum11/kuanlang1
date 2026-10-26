import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { entryPayloadSchema } from "../../lib/entry/payload";
import { submitEntry } from "../../lib/entry/save";
import { claimSheetById } from "../../lib/entry/claim";
import { startSheet } from "../../lib/sheet/create";
import { verifyHousehold, loadHouseholdForReview } from "../../lib/verification/review";
import { getReportFormOptions, listStatusPeople, reportVulnerablePerson, setVulnerableStatus } from "../../lib/vulnerable-status/core";
import { listRedGroupPeople } from "../../lib/red-group/core";
import { getLeaderActivity } from "../../lib/leader-activity/core";
import { REPORTED_SEQ_START } from "../../domain/vulnerable/reported";

// Integration — หัวหน้าชุมชนเป็นแอดมินชุมชน: ย้ายออกทั้งบ้าน · แจ้งเพิ่มคนใหม่ · ความเคลื่อนไหวบนแดชบอร์ดแอดมิน
// (Owner Decision 2026-10-26 · docs/43)
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  keyer: "test-cadmin-keyer@test.invalid",
  officer: "test-cadmin-officer@test.invalid",
  leader: "test-cadmin-leader@test.invalid",
  admin: "test-cadmin-admin@test.invalid",
} as const;
const CODES = ["TCA1", "TCA2"] as const;
const SECRET_DETAIL = "ใส่สายยางให้อาหาร-ทดสอบ";

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
  }
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAILS) } }, select: { id: true } });
  if (users.length > 0) await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: { in: [...CODES] } } });
}

describe.skipIf(!isLocalDevDb)("Integration: หัวหน้าชุมชนเป็นแอดมินชุมชน (docs/43)", () => {
  let ctxKeyer: AuthorizationContext;
  let ctxOfficer: AuthorizationContext;
  let ctxLeader: AuthorizationContext;
  let ctxAdmin: AuthorizationContext;
  let c1 = "";
  let c2 = "";
  const types: Record<string, string> = {};

  const payload = (houseNo: string, people: Array<{ first: string; age: string; type: string }>) =>
    entryPayloadSchema.parse({
      answers: { houseNo, memberCount: people.length + 1, hasVulnerable: true },
      vulnerableRows: people.map((p) => ({
        prefix: "", firstName: p.first, lastName: houseNo, age: p.age, phone: "", vulnerabilities: [types[p.type]], details: {},
      })),
    });

  async function household(communityId: string, houseNo: string, people: Array<{ first: string; age: string; type: string }>) {
    const started = await startSheet(ctxKeyer, { communityId });
    if (!started.ok) throw new Error("startSheet failed");
    const submitted = await submitEntry(ctxKeyer, started.sheetId, payload(houseNo, people));
    if (!submitted.ok) throw new Error(`submitEntry failed: ${submitted.reason}`);
    const verified = await verifyHousehold(ctxOfficer, submitted.householdId);
    if (!verified.ok) throw new Error("verify failed");
    return { sheetId: started.sheetId, householdId: submitted.householdId };
  }

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const [a, b, typeRows] = await Promise.all([
      prisma.community.create({ data: { code: CODES[0], nameTh: "ชุมชนทดสอบแอดมินชุมชนหนึ่ง" } }),
      prisma.community.create({ data: { code: CODES[1], nameTh: "ชุมชนทดสอบแอดมินชุมชนสอง" } }),
      prisma.vulnerabilityType.findMany({ where: { code: { in: ["BEDRIDDEN", "PREGNANT", "ELDERLY_DEPENDENT", "OTHER"] } }, select: { id: true, code: true } }),
    ]);
    c1 = a.id;
    c2 = b.id;
    for (const t of typeRows) types[t.code] = t.id;
    const mk = async (email: string, role: UserRoleEnum) => {
      const u = await prisma.user.create({ data: { email, name: `Fixture ${email}` } });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return u;
    };
    const [keyer, officer, leader, admin] = await Promise.all([
      mk(EMAILS.keyer, UserRoleEnum.DATA_ENTRY),
      mk(EMAILS.officer, UserRoleEnum.OFFICER),
      mk(EMAILS.leader, UserRoleEnum.COMMUNITY_LEADER),
      mk(EMAILS.admin, UserRoleEnum.ADMIN),
    ]);
    await prisma.userCommunityScope.create({ data: { userId: leader.id, communityId: c1 } });
    [ctxKeyer, ctxOfficer, ctxLeader, ctxAdmin] = await Promise.all(
      [keyer, officer, leader, admin].map((u) => loadContextOrThrow({ id: u.id, name: u.name, email: u.email })),
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("ย้ายออกทั้งบ้าน: ทุกคนที่ยังต้องดูแลในบ้าน · คนที่เสียชีวิตแล้วไม่ถูกเขียนทับ", async () => {
    const { householdId } = await household(c1, "MV-1", [
      { first: "หนึ่ง", age: "70", type: "ELDERLY_DEPENDENT" },
      { first: "สอง", age: "72", type: "ELDERLY_DEPENDENT" },
      { first: "สาม", age: "90", type: "BEDRIDDEN" },
    ]);
    const persons = await prisma.vulnerablePerson.findMany({ where: { householdId }, orderBy: { seq: "asc" }, select: { id: true } });
    expect((await setVulnerableStatus(ctxLeader, { personId: persons[2].id, target: "DECEASED", eventDate: "2026-10-01" })).ok).toBe(true);

    const moved = await setVulnerableStatus(ctxLeader, { personId: persons[0].id, target: "MOVED_OUT", eventDate: "2026-10-20", wholeHousehold: true });
    expect(moved).toEqual({ ok: true, status: "MOVED_OUT", count: 2 });
    const after = await prisma.vulnerablePerson.findMany({ where: { householdId }, orderBy: { seq: "asc" }, select: { deactivatedReason: true } });
    expect(after.map((p) => p.deactivatedReason)).toEqual(["MOVED_OUT", "MOVED_OUT", "DECEASED"]);
  });

  it("แจ้งเพิ่มคนใหม่: seq ≥ 1001 · นับทันที · มีป้าย · เฉพาะชุมชนที่ดูแล", async () => {
    const { householdId, sheetId } = await household(c1, "RP-1", [{ first: "เดิม", age: "65", type: "ELDERLY_DEPENDENT" }]);
    const other = await household(c2, "RP-2", [{ first: "อื่น", age: "65", type: "ELDERLY_DEPENDENT" }]);

    // ตัวเลือกบ้านของฟอร์ม = เฉพาะชุมชนที่ดูแล
    const options = await getReportFormOptions(ctxLeader);
    expect(options?.households.map((h) => h.id)).toContain(householdId);
    expect(options?.households.map((h) => h.id)).not.toContain(other.householdId);

    // นอกขอบเขต
    expect(await reportVulnerablePerson(ctxLeader, { householdId: other.householdId, firstName: "ทดสอบ", vulnerabilityTypeIds: [types.BEDRIDDEN] }))
      .toMatchObject({ ok: false, reason: "OUT_OF_SCOPE" });

    const first = await reportVulnerablePerson(ctxLeader, {
      householdId, firstName: "ใหม่หนึ่ง", lastName: "RP-1", ageYears: 78,
      vulnerabilityTypeIds: [types.BEDRIDDEN, types.OTHER], details: { [types.OTHER]: SECRET_DETAIL },
    });
    expect(first.ok).toBe(true);
    const second = await reportVulnerablePerson(ctxLeader, { householdId, firstName: "ใหม่สอง", vulnerabilityTypeIds: [types.PREGNANT], details: { [types.PREGNANT]: "37 สัปดาห์" } });
    expect(second.ok).toBe(true);

    const rows = await prisma.vulnerablePerson.findMany({ where: { householdId }, orderBy: { seq: "asc" }, select: { seq: true, reportedAt: true, reportedById: true } });
    expect(rows.map((r) => r.seq)).toEqual([1, REPORTED_SEQ_START, REPORTED_SEQ_START + 1]);
    expect(rows[1].reportedById).toBe(ctxLeader.userId);

    // รายละเอียดเข้ารหัสจริง (ไม่เก็บข้อความดิบ)
    const stored = await prisma.personVulnerability.findMany({ where: { person: { householdId } }, select: { detail: true } });
    expect(stored.some((v) => v.detail?.includes(SECRET_DETAIL))).toBe(false);

    // หน้าสถานะ: มีป้ายแจ้งเพิ่ม
    const list = await listStatusPeople(ctxLeader);
    const reported = list?.rows.filter((r) => r.householdId === householdId && r.reported) ?? [];
    expect(reported).toHaveLength(2);

    // นับทันที — กลุ่มสีแดง (ติดเตียง 78 ปี = กลุ่ม 1 และ 4 · ครรภ์ 37 สัปดาห์ ณ วันที่แจ้ง = กลุ่ม 3)
    const red = await listRedGroupPeople(ctxLeader);
    const redHere = red.rows.filter((r) => r.householdId === householdId);
    expect(redHere.flatMap((r) => r.classification.groups).sort()).toEqual(["BEDRIDDEN", "ELDERLY_BEDRIDDEN", "MATERNAL_NEWBORN"].sort());

    // ผู้ตรวจเห็นป้ายในหน้าใบ
    const review = await loadHouseholdForReview(ctxOfficer, householdId);
    expect(review?.vulnerablePersons.filter((p) => p.reportedLabel !== null)).toHaveLength(2);

    // ผู้คีย์แก้ใบกระดาษภายหลัง → แถวกระดาษถูกสร้างใหม่ แถวแจ้งเพิ่มต้องอยู่ครบ
    expect((await claimSheetById(ctxKeyer, sheetId)).ok).toBe(true);
    const resubmitted = await submitEntry(ctxKeyer, sheetId, payload("RP-1", [
      { first: "เดิม", age: "66", type: "ELDERLY_DEPENDENT" },
      { first: "เพิ่มในกระดาษ", age: "70", type: "ELDERLY_DEPENDENT" },
    ]));
    expect(resubmitted.ok).toBe(true);
    const afterEdit = await prisma.vulnerablePerson.findMany({ where: { householdId }, orderBy: { seq: "asc" }, select: { seq: true, reportedAt: true } });
    expect(afterEdit.map((r) => r.seq)).toEqual([1, 2, REPORTED_SEQ_START, REPORTED_SEQ_START + 1]);
    expect(afterEdit.filter((r) => r.reportedAt !== null)).toHaveLength(2);
  });

  it("ความเคลื่อนไหวจากหัวหน้าชุมชน: แอดมินเห็น · หัวหน้าชุมชนไม่เห็นการ์ดนี้", async () => {
    expect(await getLeaderActivity(ctxLeader)).toBeNull();
    const feed = await getLeaderActivity(ctxAdmin, { limit: 50 });
    const mine = feed?.items.filter((item) => item.userName === `Fixture ${EMAILS.leader}`) ?? [];
    const texts = mine.map((item) => item.text);
    expect(texts).toContain("บันทึกย้ายออกทั้งบ้าน 2 คน");
    expect(texts).toContain("แจ้งเพิ่มคนเปราะบางรายใหม่ 1 คน (นับทันที)");
    expect(texts.some((t) => t.includes("เสียชีวิต"))).toBe(true);
    // ไม่มีข้อมูลส่วนบุคคลหลุดในข้อความ
    expect(JSON.stringify(mine)).not.toContain("ใหม่หนึ่ง");
    expect(JSON.stringify(mine)).not.toContain(SECRET_DETAIL);
  });
});
