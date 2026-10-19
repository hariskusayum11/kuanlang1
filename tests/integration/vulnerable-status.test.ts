import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { AuditAction, PrismaClient, SheetStatus, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { entryPayloadSchema } from "../../lib/entry/payload";
import { submitEntry } from "../../lib/entry/save";
import { claimSheetById } from "../../lib/entry/claim";
import { startSheet } from "../../lib/sheet/create";
import { verifyHousehold } from "../../lib/verification/review";
import { listStatusPeople, setVulnerableStatus } from "../../lib/vulnerable-status/core";
import { setUserCommunities } from "../../lib/admin/users";

// Integration — หัวหน้าชุมชนบันทึกสถานะกลุ่มเปราะบาง (Owner Decision 2026-10-19 · docs/34)
// ---------------------------------------------------------------------------
// กติกาที่ต้องพิสูจน์:
//   1. หัวหน้าชุมชนเห็นเฉพาะชุมชนที่ผูกไว้ · บทบาทอื่น (นอกจาก ADMIN) เข้าไม่ได้
//   2. ไม่ส่งรายละเอียดโรค/เบอร์โทรออกจาก server เลย
//   3. บันทึกสถานะแล้วใบที่ตรวจแล้ว "ยังตรวจแล้ว" (ไม่ใช่การแก้ข้อมูลกระดาษ)
//   4. ชุมชนอื่นแตะไม่ได้แม้รู้ personId
//   5. ผู้คีย์แก้ใบภายหลัง สถานะเสียชีวิตต้องไม่หาย (และไม่ไปติดคนอื่น)
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  keyer: "test-vstatus-keyer@test.invalid",
  officer: "test-vstatus-officer@test.invalid",
  leader: "test-vstatus-leader@test.invalid",
  leader2: "test-vstatus-leader2@test.invalid",
  admin: "test-vstatus-admin@test.invalid",
} as const;

const CODES = ["TVS1", "TVS2"] as const;
const SECRET_DETAIL = "ฟอกไตสัปดาห์ละสามครั้ง";
const SECRET_PHONE = "089-555-0101";

async function cleanup() {
  const communities = await prisma.community.findMany({
    where: { code: { in: [...CODES] } },
    select: { id: true },
  });
  const communityIds = communities.map((c) => c.id);
  if (communityIds.length > 0) {
    const hh = await prisma.household.findMany({
      where: { communityId: { in: communityIds } },
      select: { id: true },
    });
    const ids = hh.map((h) => h.id);
    if (ids.length > 0) {
      await prisma.householdVersion.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.assistanceNeed.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.personVulnerability.deleteMany({ where: { person: { householdId: { in: ids } } } });
      await prisma.vulnerablePerson.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.household.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.fieldStatus.deleteMany({ where: { sheet: { communityId: { in: communityIds } } } });
    await prisma.entryAttempt.deleteMany({ where: { sheet: { communityId: { in: communityIds } } } });
    await prisma.paperSheet.deleteMany({ where: { communityId: { in: communityIds } } });
    await prisma.userCommunityScope.deleteMany({ where: { communityId: { in: communityIds } } });
  }
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  if (users.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: { in: [...CODES] } } });
}

describe.skipIf(!isLocalDevDb)("Integration: สถานะกลุ่มเปราะบางโดยหัวหน้าชุมชน (docs/34)", () => {
  let ctxKeyer: AuthorizationContext;
  let ctxOfficer: AuthorizationContext;
  let ctxLeader: AuthorizationContext;
  let ctxAdmin: AuthorizationContext;
  let leader2Id = "";
  let c1 = "";
  let c2 = "";
  let typeId = "";

  const payload = (houseNo: string, people: Array<{ first: string; last: string }>) =>
    entryPayloadSchema.parse({
      answers: { houseNo, memberCount: people.length + 1, hasVulnerable: true },
      vulnerableRows: people.map((p) => ({
        prefix: "",
        firstName: p.first,
        lastName: p.last,
        age: "70",
        phone: SECRET_PHONE,
        vulnerabilities: [typeId],
        details: { [typeId]: SECRET_DETAIL },
      })),
    });

  async function submitHousehold(
    communityId: string,
    houseNo: string,
    people: Array<{ first: string; last: string }>,
  ) {
    const started = await startSheet(ctxKeyer, { communityId });
    if (!started.ok) throw new Error("startSheet failed");
    const submitted = await submitEntry(ctxKeyer, started.sheetId, payload(houseNo, people));
    if (!submitted.ok) throw new Error(`submitEntry failed: ${submitted.reason}`);
    return { sheetId: started.sheetId, householdId: submitted.householdId };
  }

  async function personIdOf(householdId: string, seq: number) {
    const p = await prisma.vulnerablePerson.findUniqueOrThrow({
      where: { householdId_seq: { householdId, seq } },
      select: { id: true },
    });
    return p.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    const [community1, community2, type] = await Promise.all([
      prisma.community.create({ data: { code: CODES[0], nameTh: "ชุมชนทดสอบสถานะ 1" } }),
      prisma.community.create({ data: { code: CODES[1], nameTh: "ชุมชนทดสอบสถานะ 2" } }),
      prisma.vulnerabilityType.findFirstOrThrow({ where: { code: "BEDRIDDEN" }, select: { id: true } }),
    ]);
    c1 = community1.id;
    c2 = community2.id;
    typeId = type.id;

    const mkUser = async (email: string, role: UserRoleEnum) => {
      const u = await prisma.user.create({ data: { email, name: `Fixture ${email}` } });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return u;
    };
    const [keyer, officer, leader, leader2, admin] = await Promise.all([
      mkUser(EMAILS.keyer, UserRoleEnum.DATA_ENTRY),
      mkUser(EMAILS.officer, UserRoleEnum.OFFICER),
      mkUser(EMAILS.leader, UserRoleEnum.COMMUNITY_LEADER),
      mkUser(EMAILS.leader2, UserRoleEnum.COMMUNITY_LEADER),
      mkUser(EMAILS.admin, UserRoleEnum.ADMIN),
    ]);
    leader2Id = leader2.id;
    await prisma.userCommunityScope.create({ data: { userId: leader.id, communityId: c1 } });

    [ctxKeyer, ctxOfficer, ctxLeader, ctxAdmin] = await Promise.all(
      [keyer, officer, leader, admin].map((u) => loadContextOrThrow({ id: u.id, name: u.name, email: u.email })),
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("1) หัวหน้าชุมชนเห็นเฉพาะชุมชนที่ผูกไว้ · ไม่มีรายละเอียดโรคและเบอร์โทรหลุดออกมา", async () => {
    await submitHousehold(c1, "11/1", [{ first: "สมศรี", last: "หนึ่ง" }]);
    await submitHousehold(c2, "22/2", [{ first: "สมหญิง", last: "สอง" }]);

    const result = await listStatusPeople(ctxLeader);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.communities.map((c) => c.id)).toEqual([c1]);
    expect(result.rows.map((r) => r.fullName)).toEqual(["สมศรี หนึ่ง"]);
    expect(result.rows[0].vulnerabilityTypes.length).toBe(1);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(SECRET_DETAIL);
    expect(serialized).not.toContain(SECRET_PHONE);

    // ขอชุมชนอื่นผ่าน URL → ถูกเพิกเฉย ไม่ขยายขอบเขต
    const sneaky = await listStatusPeople(ctxLeader, c2);
    expect(sneaky?.rows.some((r) => r.communityId === c2)).toBe(false);
  });

  it("2) บทบาทอื่นเข้าไม่ได้ · ADMIN เห็นทุกชุมชน · หัวหน้าชุมชนที่ยังไม่ผูกชุมชนไม่เห็นอะไร", async () => {
    expect(await listStatusPeople(ctxOfficer)).toBeNull();
    expect(await listStatusPeople(ctxKeyer)).toBeNull();

    const admin = await listStatusPeople(ctxAdmin);
    const adminCommunities = admin?.communities.map((c) => c.id) ?? [];
    expect(adminCommunities).toContain(c1);
    expect(adminCommunities).toContain(c2);

    const leader2 = await prisma.user.findUniqueOrThrow({ where: { id: leader2Id } });
    const ctxLeader2 = await loadContextOrThrow({ id: leader2.id, name: leader2.name, email: leader2.email });
    const empty = await listStatusPeople(ctxLeader2);
    expect(empty?.communities).toEqual([]);
    expect(empty?.rows).toEqual([]);
  });

  it("3) บันทึกเสียชีวิต: ใบที่ตรวจแล้วยังตรวจแล้ว · เก็บผู้บันทึก/วันที่ · มี Audit ค่าก่อน/หลัง", async () => {
    const { sheetId, householdId } = await submitHousehold(c1, "33/3", [{ first: "สมปอง", last: "สาม" }]);
    expect((await verifyHousehold(ctxOfficer, householdId)).ok).toBe(true);
    const personId = await personIdOf(householdId, 1);

    const result = await setVulnerableStatus(ctxLeader, {
      personId,
      target: "DECEASED",
      eventDate: "2026-10-10",
    }, new Date("2026-10-19T05:00:00.000Z"));
    expect(result).toEqual({ ok: true, status: "DECEASED" });

    const person = await prisma.vulnerablePerson.findUniqueOrThrow({ where: { id: personId } });
    expect(person.isActive).toBe(false);
    expect(person.deactivatedReason).toBe("DECEASED");
    expect(person.deactivatedById).toBe(ctxLeader.userId);
    expect(person.deactivatedAt?.toISOString().slice(0, 10)).toBe("2026-10-10");

    const sheet = await prisma.paperSheet.findUniqueOrThrow({ where: { id: sheetId }, select: { status: true } });
    expect(sheet.status).toBe(SheetStatus.VERIFIED);
    const household = await prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { verifiedAt: true } });
    expect(household.verifiedAt).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { userId: ctxLeader.userId, action: AuditAction.UPDATE, entityType: "VulnerablePerson", entityId: personId },
      select: { changes: true },
    });
    expect(audit?.changes).toMatchObject({ status: { old: "ACTIVE", new: "DECEASED" } });

    // บันทึกซ้ำสถานะเดิม → UNCHANGED · วันที่ในอนาคต → FUTURE_DATE
    expect(await setVulnerableStatus(ctxLeader, { personId, target: "DECEASED", eventDate: "2026-10-10" }))
      .toEqual({ ok: false, reason: "UNCHANGED" });
    expect(await setVulnerableStatus(ctxLeader, { personId, target: "MOVED_OUT", eventDate: "2099-01-01" }))
      .toEqual({ ok: false, reason: "FUTURE_DATE" });

    // คืนสถานะ → ล้างค่าเหตุการณ์ทั้งหมด
    expect(await setVulnerableStatus(ctxLeader, { personId, target: "ACTIVE" })).toEqual({ ok: true, status: "ACTIVE" });
    const restored = await prisma.vulnerablePerson.findUniqueOrThrow({ where: { id: personId } });
    expect(restored).toMatchObject({ isActive: true, deactivatedReason: null, deactivatedAt: null, deactivatedById: null });
  });

  it("4) ชุมชนอื่นแตะไม่ได้แม้รู้ personId · บทบาทที่ไม่มีสิทธิ์ถูกปฏิเสธ", async () => {
    const { householdId } = await submitHousehold(c2, "44/4", [{ first: "สมใจ", last: "สี่" }]);
    const personId = await personIdOf(householdId, 1);

    expect(await setVulnerableStatus(ctxLeader, { personId, target: "MOVED_OUT", eventDate: "2026-10-01" }))
      .toEqual({ ok: false, reason: "OUT_OF_SCOPE" });
    expect(await setVulnerableStatus(ctxOfficer, { personId, target: "MOVED_OUT", eventDate: "2026-10-01" }))
      .toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(await setVulnerableStatus(ctxLeader, { personId, target: "หายไป" }))
      .toEqual({ ok: false, reason: "INVALID" });

    const person = await prisma.vulnerablePerson.findUniqueOrThrow({ where: { id: personId } });
    expect(person.isActive).toBe(true);

    // ADMIN ทำแทนได้ทุกชุมชน
    expect((await setVulnerableStatus(ctxAdmin, { personId, target: "MOVED_OUT", eventDate: "2026-10-01" })).ok).toBe(true);
  });

  it("5) ผู้คีย์แก้ใบภายหลัง: สถานะเสียชีวิตตามคนเดิมไป แม้แถวเลื่อน และไม่ติดคนอื่น", async () => {
    const people = [
      { first: "ก้อย", last: "ห้า" },
      { first: "ขวัญ", last: "ห้า" },
      { first: "คำ", last: "ห้า" },
    ];
    const { sheetId, householdId } = await submitHousehold(c1, "55/5", people);
    const khwan = await personIdOf(householdId, 2);
    expect((await setVulnerableStatus(ctxLeader, { personId: khwan, target: "DECEASED", eventDate: "2026-10-05" })).ok)
      .toBe(true);

    // ผู้คีย์เปิดใบเดิม ลบแถวแรกออก → "ขวัญ" เลื่อนจากลำดับ 2 เป็นลำดับ 1
    expect((await claimSheetById(ctxKeyer, sheetId)).ok).toBe(true);
    const resubmitted = await submitEntry(ctxKeyer, sheetId, payload("55/5", people.slice(1)));
    expect(resubmitted.ok).toBe(true);

    const after = await prisma.vulnerablePerson.findMany({
      where: { householdId },
      orderBy: { seq: "asc" },
      select: { seq: true, isActive: true, deactivatedReason: true, deactivatedById: true },
    });
    expect(after).toEqual([
      { seq: 1, isActive: false, deactivatedReason: "DECEASED", deactivatedById: ctxLeader.userId },
      { seq: 2, isActive: true, deactivatedReason: null, deactivatedById: null },
    ]);

    // ลบคนที่เสียชีวิตออกจากใบไปเลย → ไม่ไปติดคนที่เหลือ และมีร่องรอยใน Audit
    expect((await claimSheetById(ctxKeyer, sheetId)).ok).toBe(true);
    expect((await submitEntry(ctxKeyer, sheetId, payload("55/5", people.slice(2)))).ok).toBe(true);
    const remaining = await prisma.vulnerablePerson.findMany({ where: { householdId }, select: { isActive: true } });
    expect(remaining).toEqual([{ isActive: true }]);
    const trail = await prisma.auditLog.findFirst({
      where: { userId: ctxKeyer.userId, reason: "vulnerable-status-carry-over-on-reedit", entityId: householdId },
      orderBy: { createdAt: "desc" },
      select: { changes: true },
    });
    expect(trail?.changes).toMatchObject({ carried: 0, dropped: 1 });
  });

  it("6) ADMIN กำหนดชุมชนให้หัวหน้าชุมชน · ชุมชนที่ไม่มีจริงถูกปฏิเสธ", async () => {
    expect(await setUserCommunities(ctxAdmin, leader2Id, ["ckxxxxxxxxxxxxxxxxxxxxxxx"]))
      .toEqual({ ok: false, reason: "INVALID_COMMUNITY" });
    expect(await setUserCommunities(ctxOfficer, leader2Id, [c2])).toEqual({ ok: false, reason: "NOT_ALLOWED" });

    expect(await setUserCommunities(ctxAdmin, leader2Id, [c2])).toEqual({ ok: true, communityIds: [c2], changed: true });
    expect(await setUserCommunities(ctxAdmin, leader2Id, [c2])).toEqual({ ok: true, communityIds: [c2], changed: false });

    const leader2 = await prisma.user.findUniqueOrThrow({ where: { id: leader2Id } });
    const ctxLeader2 = await loadContextOrThrow({ id: leader2.id, name: leader2.name, email: leader2.email });
    const result = await listStatusPeople(ctxLeader2);
    expect(result?.communities.map((c) => c.id)).toEqual([c2]);
    expect(result?.rows.every((r) => r.communityId === c2)).toBe(true);
  });
});
