import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, SheetStatus, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { entryPayloadSchema } from "../../lib/entry/payload";
import { submitEntry } from "../../lib/entry/save";
import {
  claimSheetById,
  getMySubmittedSheets,
  getSheetForEntry,
  openSheetByCode,
  releaseSheet,
} from "../../lib/entry/claim";
import { startSheet } from "../../lib/sheet/create";
import { verifyHousehold } from "../../lib/verification/review";

// Integration — ผู้คีย์ดูและแก้ใบของตัวเองได้ตลอด (Owner Decision 2026-08-03 #R7-C)
// ---------------------------------------------------------------------------
// กติกาที่ต้องพิสูจน์:
//   1. ผู้คีย์เปิดใบที่ตนส่งไปแล้วกลับมาแก้ได้ · ของคนอื่นเปิดไม่ได้
//   2. แก้ใบที่ "ตรวจแล้ว" → ใบกลับไปรอตรวจใหม่อัตโนมัติ (ตัวเลขตรวจแล้วต้องไม่โกหก)
//   3. การแก้ต้องเขียนทับ Household เดิม ไม่สร้างซ้ำ
//   4. ออกจากฟอร์มกลางคัน ต้องคืนสถานะเดิม ไม่กลายเป็นใบว่าง
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  keyer: "test-reedit-keyer@test.invalid",
  other: "test-reedit-other@test.invalid",
  verifier: "test-reedit-verifier@test.invalid",
} as const;

const C_CODE = "TRE1";

const PAYLOAD = (houseNo: string) =>
  entryPayloadSchema.parse({
    answers: { houseNo, memberCount: 2, hasVulnerable: false },
  });

async function cleanup() {
  const community = await prisma.community.findFirst({
    where: { code: C_CODE },
    select: { id: true },
  });
  if (community) {
    const hh = await prisma.household.findMany({
      where: { communityId: community.id },
      select: { id: true },
    });
    const ids = hh.map((h) => h.id);
    if (ids.length > 0) {
      await prisma.householdVersion.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.assistanceNeed.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.personVulnerability.deleteMany({
        where: { person: { householdId: { in: ids } } },
      });
      await prisma.vulnerablePerson.deleteMany({ where: { householdId: { in: ids } } });
      await prisma.household.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.fieldStatus.deleteMany({ where: { sheet: { communityId: community.id } } });
    await prisma.entryAttempt.deleteMany({ where: { sheet: { communityId: community.id } } });
    await prisma.paperSheet.deleteMany({ where: { communityId: community.id } });
  }
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  if (users.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: C_CODE } });
}

describe.skipIf(!isLocalDevDb)("Integration: ผู้คีย์แก้ใบของตัวเอง (#R7-C)", () => {
  let ctxKeyer: AuthorizationContext;
  let ctxOther: AuthorizationContext;
  let ctxVerifier: AuthorizationContext;
  let communityId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    const community = await prisma.community.create({
      data: { code: C_CODE, nameTh: "ชุมชนทดสอบแก้ใบ" },
    });
    communityId = community.id;

    const mkUser = async (email: string, role: UserRoleEnum) => {
      const u = await prisma.user.create({ data: { email, name: `Fixture ${email}` } });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return u;
    };
    const [keyer, other, verifier] = await Promise.all([
      mkUser(EMAILS.keyer, UserRoleEnum.DATA_ENTRY),
      mkUser(EMAILS.other, UserRoleEnum.DATA_ENTRY),
      mkUser(EMAILS.verifier, UserRoleEnum.OFFICER),
    ]);
    [ctxKeyer, ctxOther, ctxVerifier] = await Promise.all(
      [keyer, other, verifier].map((u) =>
        loadContextOrThrow({ id: u.id, name: u.name, email: u.email }),
      ),
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /** เริ่มใบใหม่แล้วส่งทันที — คืน sheetId + sheetNo ที่ระบบออกให้ */
  async function startAndSubmit(houseNo: string) {
    const started = await startSheet(ctxKeyer, { communityId });
    if (!started.ok) throw new Error("startSheet failed");
    const submitted = await submitEntry(ctxKeyer, started.sheetId, PAYLOAD(houseNo));
    if (!submitted.ok) throw new Error(`submitEntry failed: ${submitted.reason}`);
    return { ...started, householdId: submitted.householdId, submitted };
  }

  it("1) ใบที่ส่งแล้วขึ้นในรายการ 'แบบสอบถามที่ฉันคีย์' ของตนเอง ไม่ขึ้นของคนอื่น", async () => {
    const s = await startAndSubmit("1/1");

    const mine = await getMySubmittedSheets(ctxKeyer);
    expect(mine.some((r) => r.id === s.sheetId)).toBe(true);
    const row = mine.find((r) => r.id === s.sheetId)!;
    expect(row.sheetNo).toBe(s.sheetNo);
    expect(row.verifiedAt).toBeNull();

    const others = await getMySubmittedSheets(ctxOther);
    expect(others.some((r) => r.id === s.sheetId)).toBe(false);
  });

  it("2) เจ้าของเปิดใบที่ส่งแล้วกลับมาแก้ได้ · คนอื่นเปิดไม่ได้", async () => {
    const s = await startAndSubmit("2/2");

    // คนอื่นเปิดไม่ได้ — ใบไม่ได้อยู่ในขั้นตอนคีย์แล้ว
    expect(await openSheetByCode(ctxOther, s.sheetNo)).toEqual({
      ok: false,
      reason: "WRONG_STATUS",
      status: SheetStatus.ENTERED_1,
    });

    // เจ้าของเปิดได้
    const reopened = await openSheetByCode(ctxKeyer, s.sheetNo);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    expect(reopened.sheetId).toBe(s.sheetId);

    const access = await getSheetForEntry(ctxKeyer, s.sheetId);
    expect(access.kind).toBe("OK");
  });

  it("3) แก้แล้วเขียนทับ Household เดิม ไม่สร้างใบซ้ำ", async () => {
    const s = await startAndSubmit("3/3");
    const before = await prisma.household.count({ where: { sheetId: s.sheetId } });
    expect(before).toBe(1);

    const reopened = await openSheetByCode(ctxKeyer, s.sheetNo);
    expect(reopened.ok).toBe(true);
    const again = await submitEntry(ctxKeyer, s.sheetId, PAYLOAD("3/3-แก้แล้ว"));
    expect(again.ok).toBe(true);
    if (!again.ok) return;

    expect(again.householdId).toBe(s.householdId); // ตัวเดิม ไม่ใช่ตัวใหม่
    expect(again.reopenedForVerify).toBe(false); // ยังไม่เคยตรวจ จึงไม่ใช่การส่งกลับ
    expect(await prisma.household.count({ where: { sheetId: s.sheetId } })).toBe(1);

    const hh = await prisma.household.findUniqueOrThrow({
      where: { id: s.householdId },
      select: { houseNo: true },
    });
    expect(hh.houseNo).toBe("3/3-แก้แล้ว");
  });

  it("4) แก้ใบที่ตรวจแล้ว → กลับไปรอตรวจใหม่ + ล้างผู้ยืนยัน (ตัวเลขตรวจแล้วต้องไม่โกหก)", async () => {
    const s = await startAndSubmit("4/4");

    const verified = await verifyHousehold(ctxVerifier, s.householdId);
    expect(verified.ok).toBe(true);
    const afterVerify = await prisma.household.findUniqueOrThrow({
      where: { id: s.householdId },
      select: { verifiedById: true, verifiedAt: true, sheet: { select: { status: true } } },
    });
    expect(afterVerify.verifiedAt).not.toBeNull();
    expect(afterVerify.sheet.status).toBe(SheetStatus.VERIFIED);

    // เจ้าของเปิดใบที่ตรวจแล้วกลับมาแก้ได้
    const reopened = await openSheetByCode(ctxKeyer, s.sheetNo);
    expect(reopened.ok).toBe(true);

    const again = await submitEntry(ctxKeyer, s.sheetId, PAYLOAD("4/4-แก้หลังตรวจ"));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.reopenedForVerify).toBe(true);

    const afterEdit = await prisma.household.findUniqueOrThrow({
      where: { id: s.householdId },
      select: { verifiedById: true, verifiedAt: true, sheet: { select: { status: true } } },
    });
    expect(afterEdit.sheet.status).toBe(SheetStatus.ENTERED_1); // กลับไปรอตรวจ
    expect(afterEdit.verifiedById).toBeNull();
    expect(afterEdit.verifiedAt).toBeNull();
  });

  it("5) ออกจากฟอร์มกลางคัน → คืนสถานะเดิม ไม่กลายเป็นใบว่าง", async () => {
    const s = await startAndSubmit("5/5");

    // ใบที่คีย์เสร็จแล้ว: เปิดแก้ → ปล่อย → ต้องกลับเป็น ENTERED_1 ไม่ใช่ PENDING
    expect((await openSheetByCode(ctxKeyer, s.sheetNo)).ok).toBe(true);
    expect(await releaseSheet(ctxKeyer, s.sheetId)).toBe(true);
    let sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { id: s.sheetId },
      select: { status: true, lockedById: true },
    });
    expect(sheet.status).toBe(SheetStatus.ENTERED_1);
    expect(sheet.lockedById).toBeNull();

    // ใบที่ตรวจแล้ว: เปิดแก้ → ปล่อย → ต้องกลับเป็น VERIFIED
    expect((await verifyHousehold(ctxVerifier, s.householdId)).ok).toBe(true);
    expect((await claimSheetById(ctxKeyer, s.sheetId)).ok).toBe(true);
    expect(await releaseSheet(ctxKeyer, s.sheetId)).toBe(true);
    sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { id: s.sheetId },
      select: { status: true, lockedById: true },
    });
    expect(sheet.status).toBe(SheetStatus.VERIFIED);
    expect(sheet.lockedById).toBeNull();
  });

  it("6) ใบใหม่ที่ยังไม่ได้คีย์ ปล่อยแล้วยังกลับเป็น PENDING ตามเดิม", async () => {
    const started = await startSheet(ctxKeyer, { communityId });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    expect(await releaseSheet(ctxKeyer, started.sheetId)).toBe(true);
    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { id: started.sheetId },
      select: { status: true },
    });
    expect(sheet.status).toBe(SheetStatus.PENDING);
  });

  it("7) คนอื่น claim ใบที่ผู้อื่นคีย์ไว้ไม่ได้ แม้จะรู้ sheetId", async () => {
    const s = await startAndSubmit("7/7");
    expect(await claimSheetById(ctxOther, s.sheetId)).toEqual({
      ok: false,
      reason: "NO_WORK",
    });
    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { id: s.sheetId },
      select: { status: true, lockedById: true },
    });
    expect(sheet.status).toBe(SheetStatus.ENTERED_1);
    expect(sheet.lockedById).toBeNull();
  });
});
