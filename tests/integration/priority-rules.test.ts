import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, TriageLevel, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { entryPayloadSchema } from "../../lib/entry/payload";
import { submitEntry } from "../../lib/entry/save";
import { startSheet } from "../../lib/sheet/create";
import { verifyHousehold } from "../../lib/verification/review";
import { getActiveRuleSet, getRulesPageData, previewRuleChange, saveRuleVersion } from "../../lib/rules/core";
import { getHelpPriority } from "../../lib/risk/help-priority";
import { getRiskList } from "../../lib/risk/list";
import { toEditValues } from "../../domain/rules/priority-rules";

// Integration — กฎการจัดลำดับแบบมีเวอร์ชัน + ลำดับการช่วยเหลือบนแผนที่ (docs/40)
// ---------------------------------------------------------------------------
// กติกาที่ต้องพิสูจน์:
//   1. ทุกฝ่ายที่มี dashboard.view เห็นกฎ · แก้/ดูผลกระทบได้เฉพาะ ADMIN (server)
//   2. บันทึก = เวอร์ชันใหม่ ไม่ทับของเดิม + Audit old → new · ค่าที่ค้าง (เวอร์ชันเก่า) ถูกปฏิเสธ
//   3. เปลี่ยนการจับคู่ประเภท → ระดับที่ตั้งอัตโนมัติย้ายตาม · ระดับที่ปรับเองคงไว้
//   4. ลำดับการช่วยเหลือ: ทุกบ้านที่ตรวจแล้ว (รวมบ้านไม่มีพิกัด) · ต้องมี household.view
// ⚠️ DB ใช้ร่วมกับ session อื่น — แก้เฉพาะประเภทความเปราะบางที่สร้างขึ้นเพื่อทดสอบ และลบเวอร์ชันที่สร้างทิ้งเสมอ
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
const prisma = new PrismaClient();

const EMAILS = {
  admin: "test-rules-admin@test.invalid",
  officer: "test-rules-officer@test.invalid",
  executive: "test-rules-exec@test.invalid",
  keyer: "test-rules-keyer@test.invalid",
} as const;
const COMMUNITY = "TPR1";
const TYPE_CODE = "ZZ_RULE_TEST";

let baselineVersion = 0;

async function cleanup() {
  await prisma.priorityRuleVersion.deleteMany({ where: { versionNo: { gt: baselineVersion } } });
  const community = await prisma.community.findUnique({ where: { code: COMMUNITY }, select: { id: true } });
  if (community) {
    const ids = (await prisma.household.findMany({ where: { communityId: community.id }, select: { id: true } })).map((h) => h.id);
    if (ids.length) {
      await prisma.householdVersion.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.assistanceNeed.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.personVulnerability.deleteMany({ where: { person: { householdId: { in: ids } } } });
      await prisma.vulnerablePerson.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.floodRiskProfile.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.household.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.fieldStatus.deleteMany({ where: { sheet: { communityId: community.id } } });
    await prisma.entryAttempt.deleteMany({ where: { sheet: { communityId: community.id } } });
    await prisma.paperSheet.deleteMany({ where: { communityId: community.id } });
  }
  await prisma.personVulnerability.deleteMany({ where: { vulnerabilityType: { code: TYPE_CODE } } });
  await prisma.vulnerabilityType.deleteMany({ where: { code: TYPE_CODE } });
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAILS) } }, select: { id: true } });
  if (users.length) await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: COMMUNITY } });
}

describe.skipIf(!isLocalDevDb)("Integration: กฎการจัดลำดับ (docs/40)", () => {
  let admin: AuthorizationContext;
  let officer: AuthorizationContext;
  let executive: AuthorizationContext;
  let keyer: AuthorizationContext;
  let communityId = "";
  let householdId = "";
  let autoPersonId = "";
  let manualPersonId = "";

  beforeAll(async () => {
    await prisma.$connect();
    baselineVersion = (await prisma.priorityRuleVersion.aggregate({ _max: { versionNo: true } }))._max.versionNo ?? 0;
    await cleanup();

    communityId = (await prisma.community.create({ data: { code: COMMUNITY, nameTh: "ชุมชนทดสอบกฎ" } })).id;
    // ประเภททดสอบปิดใช้งาน — ไม่โผล่ในฟอร์มคีย์ของ session อื่น
    const testType = await prisma.vulnerabilityType.create({
      data: { code: TYPE_CODE, nameTh: "ZZ ประเภททดสอบกฎ", basePriority: TriageLevel.P3, isActive: false, sortOrder: 999 },
    });
    const bedridden = await prisma.vulnerabilityType.findFirstOrThrow({ where: { code: "BEDRIDDEN" }, select: { id: true } });

    const mk = async (email: string, role: UserRoleEnum) => {
      const u = await prisma.user.create({ data: { email, name: `Fixture ${email}` } });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return loadContextOrThrow({ id: u.id, name: u.name, email: u.email });
    };
    [admin, officer, executive, keyer] = await Promise.all([
      mk(EMAILS.admin, UserRoleEnum.ADMIN),
      mk(EMAILS.officer, UserRoleEnum.OFFICER),
      mk(EMAILS.executive, UserRoleEnum.EXECUTIVE),
      mk(EMAILS.keyer, UserRoleEnum.DATA_ENTRY),
    ]);

    // บ้านที่ตรวจแล้ว 1 หลัง (ผู้ป่วยติดเตียง · ไม่มีพิกัด) ผ่าน flow จริง
    const started = await startSheet(keyer, { communityId });
    if (!started.ok) throw new Error("startSheet failed");
    const submitted = await submitEntry(keyer, started.sheetId, entryPayloadSchema.parse({
      answers: { houseNo: "9/9", memberCount: 3, hasVulnerable: true },
      vulnerableRows: [{ prefix: "", firstName: "ทดสอบ", lastName: "กฎ", age: "80", phone: "", vulnerabilities: [bedridden.id], details: {} }],
    }));
    if (!submitted.ok) throw new Error(`submitEntry failed: ${submitted.reason}`);
    householdId = submitted.householdId;
    expect((await verifyHousehold(officer, householdId)).ok).toBe(true);

    // บุคคลที่มีเฉพาะประเภททดสอบ: คนหนึ่งตั้งอัตโนมัติ (P3 ตรงเกณฑ์) อีกคนผู้ดูแลปรับเอง (P2)
    const mkPerson = async (seq: number, level: TriageLevel) => {
      const p = await prisma.vulnerablePerson.create({ data: { householdId, seq, triageLevel: level } });
      await prisma.personVulnerability.create({ data: { personId: p.id, vulnerabilityTypeId: testType.id } });
      return p.id;
    };
    autoPersonId = await mkPerson(50, TriageLevel.P3);
    manualPersonId = await mkPerson(51, TriageLevel.P2);
  }, 60_000);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function editFor(base: Awaited<ReturnType<typeof getActiveRuleSet>>) {
    const values = toEditValues(base);
    return { ...values, baseVersionNo: base.versionNo, reason: "ทดสอบอัตโนมัติ" };
  }

  it("1) ทุกฝ่ายที่เห็นแดชบอร์ดเห็นกฎ · แก้/ดูผลกระทบได้เฉพาะ ADMIN", async () => {
    const forOfficer = await getRulesPageData(officer);
    expect(forOfficer?.canManage).toBe(false);
    expect((await getRulesPageData(executive))?.canManage).toBe(false);
    expect(await getRulesPageData(keyer)).toBeNull();
    expect((await getRulesPageData(admin))?.canManage).toBe(true);

    const input = await editFor(await getActiveRuleSet());
    expect(await saveRuleVersion(officer, input)).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(await saveRuleVersion(executive, input)).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(await previewRuleChange(officer, input)).toEqual({ ok: false, reason: "FORBIDDEN" });
  });

  it("2) ตัวอย่างผลกระทบ → บันทึกเวอร์ชันใหม่ · ระดับอัตโนมัติย้าย · ระดับปรับเองคงไว้ · มี Audit", async () => {
    const before = await getActiveRuleSet();
    const input = await editFor(before);
    input.triage = { ...input.triage, [TYPE_CODE]: "P1" };
    input.weights = { ...input.weights, FLOOR_LEVEL: (input.weights.FLOOR_LEVEL ?? 20) + 5 };

    const preview = await previewRuleChange(admin, input);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.changes.map((c) => c.field)).toEqual(expect.arrayContaining(["weight.FLOOR_LEVEL", `triage.${TYPE_CODE}`]));
    expect(preview.impact.people.after.P1 - preview.impact.people.before.P1).toBeGreaterThanOrEqual(1);

    const saved = await saveRuleVersion(admin, input);
    expect(saved).toMatchObject({ ok: true, versionNo: before.versionNo + 1, triageUpdated: 1 });

    const after = await getActiveRuleSet();
    expect(after.versionNo).toBe(before.versionNo + 1);
    expect(after.triage[TYPE_CODE]).toBe("P1");
    expect(after.risk.factors.find((f) => f.code === "FLOOR_LEVEL")?.weight).toBe(input.weights.FLOOR_LEVEL);
    // เวอร์ชันเดิมยังอยู่ครบ (ไม่เขียนทับ)
    if (before.versionNo > 0) {
      const old = await prisma.priorityRuleVersion.findUniqueOrThrow({ where: { versionNo: before.versionNo } });
      expect(JSON.stringify(old.riskConfig)).not.toContain(`"weightVersion":"${after.risk.weightVersion}"`);
    }

    const people = await prisma.vulnerablePerson.findMany({ where: { id: { in: [autoPersonId, manualPersonId] } }, select: { id: true, triageLevel: true } });
    expect(people.find((p) => p.id === autoPersonId)?.triageLevel).toBe("P1");
    expect(people.find((p) => p.id === manualPersonId)?.triageLevel).toBe("P2");

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { userId: admin.userId, entityType: "PriorityRuleVersion" }, orderBy: { createdAt: "desc" } });
    expect(audit.reason).toBe("ทดสอบอัตโนมัติ");
    expect(JSON.stringify(audit.changes)).toContain(`triage.${TYPE_CODE}`);
  });

  it("3) ค่าที่ค้างจากเวอร์ชันเก่าถูกปฏิเสธ · ไม่มีอะไรเปลี่ยนไม่สร้างเวอร์ชัน · ค่าเพี้ยนถูกปฏิเสธที่ server", async () => {
    const current = await getActiveRuleSet();
    const stale = { ...(await editFor(current)), baseVersionNo: current.versionNo - 1 };
    expect(await saveRuleVersion(admin, stale)).toEqual({ ok: false, reason: "CONFLICT" });
    expect(await saveRuleVersion(admin, await editFor(current))).toEqual({ ok: false, reason: "NO_CHANGE" });
    const bad = { ...(await editFor(current)), thresholds: { LOW: 60, MEDIUM: 50, HIGH: 70 } };
    expect(await saveRuleVersion(admin, bad)).toMatchObject({ ok: false, reason: "INVALID" });
    const missingType = await editFor(current);
    delete missingType.triage.BEDRIDDEN;
    expect(await saveRuleVersion(admin, missingType)).toMatchObject({ ok: false, reason: "INVALID" });
    expect((await getActiveRuleSet()).versionNo).toBe(current.versionNo);
  });

  it("4) ลำดับการช่วยเหลือ: บ้านไม่มีพิกัดยังอยู่ในรายการ · วิกฤตอยู่บน · ต้องมีสิทธิ์ดูครัวเรือน", async () => {
    expect(await getHelpPriority(executive, { communityId })).toBeNull();
    const result = await getHelpPriority(admin, { communityId });
    expect(result?.cases).toHaveLength(1);
    const [first] = result?.cases ?? [];
    expect(first).toMatchObject({ rank: 1, householdId, urgency: "critical", lat: null, lng: null, hardRule: true });
    expect(first.triage.P1).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(result)).not.toContain("ทดสอบ กฎ");

    // หน้า /risk ใช้กฎเวอร์ชันเดียวกัน
    const risk = await getRiskList(admin);
    expect(risk.config.versionNo).toBe((await getActiveRuleSet()).versionNo);
    expect(risk.rows.some((r) => r.householdId === householdId)).toBe(true);
  });
});
