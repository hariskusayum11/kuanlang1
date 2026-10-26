import { describe, it, expect, beforeAll, afterAll } from "vitest";
import ExcelJS from "exceljs";
import { PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { entryPayloadSchema } from "../../lib/entry/payload";
import { submitEntry } from "../../lib/entry/save";
import { startSheet } from "../../lib/sheet/create";
import { verifyHousehold } from "../../lib/verification/review";
import { canViewRedGroup, listRedGroupPeople, redGroupsByHousehold } from "../../lib/red-group/core";
import { buildRedGroupWorkbook, toExportRows } from "../../lib/red-group/export";
import { getKeyring } from "../../lib/crypto/keys";
import { getHouseholdLayerMap } from "../../lib/geo/household-layer-map";

// Integration — กลุ่มเปราะบางสีแดง (Owner Decision 2026-10-26 · docs/42)
// ---------------------------------------------------------------------------
// ล็อก: (1) หัวหน้าชุมชนได้เฉพาะชุมชนที่ผูก · ADMIN ได้ทุกชุมชน · บทบาทอื่นไม่ได้
//       (2) เฉพาะใบที่ตรวจแล้ว · ไม่นับคนที่บันทึกว่าเสียชีวิต
//       (3) ไฟล์ถอดรหัสชื่อได้ และไม่มีรายละเอียดโรคดิบ
//       (4) แผนที่โหมดสีแดงแสดงเฉพาะบ้านกลุ่มสีแดง
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  keyer: "test-red-keyer@test.invalid",
  officer: "test-red-officer@test.invalid",
  admin: "test-red-admin@test.invalid",
  executive: "test-red-executive@test.invalid",
  leader: "test-red-leader@test.invalid",
} as const;
const CODES = ["TRGA", "TRGB"] as const;
const NAME_A = "ชุมชนทดสอบสีแดงเอ";
const NAME_B = "ชุมชนทดสอบสีแดงบี";
const SECRET_DETAIL = "รายละเอียดลับทดสอบ-ห้ามหลุด";

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

describe.skipIf(!isLocalDevDb)("Integration: กลุ่มเปราะบางสีแดง (docs/42)", () => {
  let ctxKeyer: AuthorizationContext;
  let ctxOfficer: AuthorizationContext;
  let ctxAdmin: AuthorizationContext;
  let ctxExecutive: AuthorizationContext;
  let ctxLeader: AuthorizationContext;
  let cA = "";
  let cB = "";
  const types: Record<string, string> = {};
  const houses: Record<string, string> = {};

  async function household(
    communityId: string,
    houseNo: string,
    row: { firstName: string; age: string; types: string[]; details?: Record<string, string> },
    verify: boolean,
  ) {
    const started = await startSheet(ctxKeyer, { communityId });
    if (!started.ok) throw new Error("startSheet failed");
    const payload = entryPayloadSchema.parse({
      answers: { houseNo, memberCount: 1, hasVulnerable: true },
      vulnerableRows: [{
        prefix: "",
        firstName: row.firstName,
        lastName: houseNo,
        age: row.age,
        phone: "",
        vulnerabilities: row.types.map((code) => types[code]),
        details: Object.fromEntries(Object.entries(row.details ?? {}).map(([code, text]) => [types[code], text])),
      }],
    });
    const submitted = await submitEntry(ctxKeyer, started.sheetId, payload);
    if (!submitted.ok) throw new Error(`submitEntry failed: ${submitted.reason}`);
    await prisma.household.update({
      where: { id: submitted.householdId },
      data: { latitude: 7.01, longitude: 100.45, surveyedAt: new Date() },
    });
    if (verify) {
      const verified = await verifyHousehold(ctxOfficer, submitted.householdId);
      if (!verified.ok) throw new Error("verify failed");
    }
    houses[houseNo] = submitted.householdId;
    return submitted.householdId;
  }

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const [a, b, typeRows] = await Promise.all([
      prisma.community.create({ data: { code: CODES[0], nameTh: NAME_A } }),
      prisma.community.create({ data: { code: CODES[1], nameTh: NAME_B } }),
      prisma.vulnerabilityType.findMany({ where: { code: { in: ["BEDRIDDEN", "PREGNANT", "OTHER", "ELDERLY_DEPENDENT"] } }, select: { id: true, code: true } }),
    ]);
    cA = a.id;
    cB = b.id;
    for (const t of typeRows) types[t.code] = t.id;

    const mkUser = async (email: string, role: UserRoleEnum) => {
      const u = await prisma.user.create({ data: { email, name: `Fixture ${email}` } });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return u;
    };
    const [keyer, officer, admin, executive, leader] = await Promise.all([
      mkUser(EMAILS.keyer, UserRoleEnum.DATA_ENTRY),
      mkUser(EMAILS.officer, UserRoleEnum.OFFICER),
      mkUser(EMAILS.admin, UserRoleEnum.ADMIN),
      mkUser(EMAILS.executive, UserRoleEnum.EXECUTIVE),
      mkUser(EMAILS.leader, UserRoleEnum.COMMUNITY_LEADER),
    ]);
    await prisma.userCommunityScope.create({ data: { userId: leader.id, communityId: cA } });
    [ctxKeyer, ctxOfficer, ctxAdmin, ctxExecutive, ctxLeader] = await Promise.all(
      [keyer, officer, admin, executive, leader].map((u) => loadContextOrThrow({ id: u.id, name: u.name, email: u.email })),
    );

    // ชุมชน A
    await household(cA, "RA-1", { firstName: "ติดเตียงเอ", age: "82", types: ["BEDRIDDEN"], details: {} }, true);
    await household(cA, "RA-2", { firstName: "ครรภ์เอ", age: "29", types: ["PREGNANT"], details: { PREGNANT: "38 สัปดาห์" } }, true);
    await household(cA, "RA-3", { firstName: "สายยางเอ", age: "77", types: ["OTHER"], details: { OTHER: `ใส่สายยาง ${SECRET_DETAIL}` } }, true);
    await household(cA, "RA-4", { firstName: "ไม่เข้าเกณฑ์เอ", age: "65", types: ["ELDERLY_DEPENDENT"] }, true);
    await household(cA, "RA-5", { firstName: "ยังไม่ตรวจเอ", age: "90", types: ["BEDRIDDEN"] }, false);
    const dead = await household(cA, "RA-6", { firstName: "เสียชีวิตเอ", age: "88", types: ["BEDRIDDEN"] }, true);
    await prisma.vulnerablePerson.updateMany({ where: { householdId: dead }, data: { isActive: false, deactivatedReason: "DECEASED" } });
    // ชุมชน B
    await household(cB, "RB-1", { firstName: "ติดเตียงบี", age: "70", types: ["BEDRIDDEN"] }, true);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("สิทธิ์: ADMIN · ผู้บริหาร/แพทย์ · หัวหน้าชุมชน เท่านั้น", async () => {
    expect(canViewRedGroup(ctxAdmin)).toBe(true);
    expect(canViewRedGroup(ctxExecutive)).toBe(true);
    expect(canViewRedGroup(ctxLeader)).toBe(true);
    expect(canViewRedGroup(ctxOfficer)).toBe(false);
    expect(canViewRedGroup(ctxKeyer)).toBe(false);
    expect((await listRedGroupPeople(ctxOfficer)).rows).toEqual([]);
  });

  it("หัวหน้าชุมชน: เฉพาะชุมชน A · ตรวจแล้ว · ไม่นับผู้เสียชีวิต", async () => {
    const result = await listRedGroupPeople(ctxLeader);
    expect(result.communities.map((c) => c.id)).toEqual([cA]);
    expect(result.rows.every((r) => r.communityId === cA)).toBe(true);
    const houseIds = result.rows.map((r) => r.householdId).sort();
    expect(houseIds).toEqual([houses["RA-1"], houses["RA-2"], houses["RA-3"]].sort());
    expect(result.tally).toMatchObject({
      people: 3,
      households: 3,
      needsCheck: 1,
      byGroup: { BEDRIDDEN: 1, DIALYSIS: 0, MATERNAL_NEWBORN: 1, ELDERLY_BEDRIDDEN: 2 },
    });
    expect(JSON.stringify(result)).not.toContain(NAME_B);
  });

  it("ADMIN และผู้บริหาร/แพทย์: เห็นทั้งสองชุมชน", async () => {
    for (const ctx of [ctxAdmin, ctxExecutive]) {
      const result = await listRedGroupPeople(ctx);
      const ours = result.rows.filter((r) => r.communityId === cA || r.communityId === cB);
      expect(ours.map((r) => r.householdId)).toEqual(expect.arrayContaining([houses["RA-1"], houses["RB-1"]]));
    }
  });

  it("ไฟล์ Excel: ถอดรหัสชื่อได้ · ไม่มีรายละเอียดโรคดิบ · แถวควรยืนยันมีธง", async () => {
    const result = await listRedGroupPeople(ctxLeader);
    const rows = toExportRows(result.rows, getKeyring());
    expect(rows.map((r) => r.fullName).sort()).toEqual(["ครรภ์เอ RA-2", "ติดเตียงเอ RA-1", "สายยางเอ RA-3"]);
    expect(JSON.stringify(rows)).not.toContain(SECRET_DETAIL);
    expect(rows.find((r) => r.fullName.startsWith("สายยางเอ"))?.needsCheck).toBe(true);
    expect(rows.find((r) => r.fullName.startsWith("ครรภ์เอ"))?.notes).toContain("ใกล้คลอด");

    const buffer = await buildRedGroupWorkbook(result, rows);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    // หัวหน้าชุมชนชุมชนเดียว → สรุป + ชีตชุมชน (ไม่มีชีต "ทั้งหมด" ซ้ำ)
    expect(wb.worksheets.map((ws) => ws.name)).toEqual(["สรุป", NAME_A]);
  });

  it("แผนที่โหมดสีแดง: เฉพาะบ้านกลุ่มสีแดงในขอบเขต พร้อมเลขกลุ่ม", async () => {
    const redMap = redGroupsByHousehold((await listRedGroupPeople(ctxLeader)).rows);
    const map = await getHouseholdLayerMap(ctxLeader, {}, redMap);
    expect(map.points.map((p) => p.houseNo).sort()).toEqual(["RA-1", "RA-2", "RA-3"]);
    expect(map.points.find((p) => p.houseNo === "RA-1")?.redGroups).toEqual(["BEDRIDDEN", "ELDERLY_BEDRIDDEN"]);
    expect(JSON.stringify(map)).not.toContain(NAME_B);
  });
});
