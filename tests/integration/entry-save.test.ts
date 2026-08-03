import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  AuditAction,
  PrismaClient,
  SheetStatus,
  UserRoleEnum,
} from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { decryptText, isEncrypted, phoneBlindIndex } from "../../lib/crypto/encryption";
import { getKeyring, getSearchHashKey } from "../../lib/crypto/keys";
import { openSheetByCode } from "../../lib/entry/claim";
import { entryPayloadSchema } from "../../lib/entry/payload";
import { loadDraftPayload, saveDraft, submitEntry } from "../../lib/entry/save";

// Integration tests — Entry Save: Draft/Submit แบบเข้ารหัส (R5 + R4-1 Single-Entry)
// -----------------------------------------------------------------------------
// รันเฉพาะ local dev DB — fixtures สังเคราะห์ (TES-*) ลบใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  keyerA: "test-esave-a@test.invalid",
  keyerB: "test-esave-b@test.invalid",
  noScope: "test-esave-c@test.invalid",
} as const;
const C_CODE = "TES1";
const SHEETS = ["SK-970001", "SK-970002", "SK-970003", "SK-970004"];

async function cleanupFixtures() {
  {
    const households = await prisma.household.findMany({
      where: { sheet: { sheetNo: { in: SHEETS } } },
      select: { id: true },
    });
    const hids = households.map((h) => h.id);
    if (hids.length > 0) {
      await prisma.personVulnerability.deleteMany({
        where: { person: { householdId: { in: hids } } },
      });
      await prisma.vulnerablePerson.deleteMany({
        where: { householdId: { in: hids } },
      });
      await prisma.household.deleteMany({ where: { id: { in: hids } } });
    }
    await prisma.fieldStatus.deleteMany({ where: { sheet: { sheetNo: { in: SHEETS } } } });
    await prisma.entryAttempt.deleteMany({ where: { sheet: { sheetNo: { in: SHEETS } } } });
    await prisma.paperSheet.deleteMany({ where: { sheetNo: { in: SHEETS } } });
  }
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  if (users.length > 0) {
    await prisma.auditLog.deleteMany({
      where: { userId: { in: users.map((u) => u.id) } },
    });
  }
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(EMAILS) } },
  });
  await prisma.community.deleteMany({ where: { code: C_CODE } });
}

describe.skipIf(!isLocalDevDb)("Integration: Entry Save (Draft/Submit เข้ารหัส)", () => {
  let ctxA: AuthorizationContext;
  let ctxB: AuthorizationContext;
  let ctxNoScope: AuthorizationContext;
  let vulnerabilityTypeId: string;
  let namePrefixId: string;
  const sheetIds: Record<string, string> = {};

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    await cleanupFixtures();

    const community = await prisma.community.create({
      data: { code: C_CODE, nameTh: "ชุมชนทดสอบบันทึกใบ" },
    });
    const mkUser = (email: string) =>
      prisma.user.create({ data: { email, name: `ESave Fixture ${email}` } });
    const userA = await mkUser(EMAILS.keyerA);
    const userB = await mkUser(EMAILS.keyerB);
    // userC = DATA_ENTRY แต่ "ไม่มี" community scope (ทดสอบ Owner Decision: คีย์ชุมชนไหนก็ได้)
    const userC = await mkUser(EMAILS.noScope);
    await prisma.userRole.createMany({
      data: [
        { userId: userA.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
        { userId: userB.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
        { userId: userC.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
      ],
    });
    await prisma.userCommunityScope.createMany({
      data: [
        { userId: userA.id, communityId: community.id },
        { userId: userB.id, communityId: community.id },
      ],
    });

    for (const sheetNo of SHEETS) {
      const s = await prisma.paperSheet.create({
        data: { communityId: community.id, sheetNo },
      });
      sheetIds[sheetNo] = s.id;
    }

    // master data สำหรับ vulnerabilities — ใช้ประเภทแรกที่ seed ไว้
    const vt = await prisma.vulnerabilityType.findFirst({ select: { id: true } });
    if (!vt) throw new Error("ต้องมี VulnerabilityType seed ใน dev DB");
    vulnerabilityTypeId = vt.id;

    const np = await prisma.namePrefix.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (!np) throw new Error("ต้องมี NamePrefix seed ใน dev DB");
    namePrefixId = np.id;

    const load = (u: { id: string; name: string; email: string }) =>
      loadContextOrThrow({ id: u.id, name: u.name, email: u.email });
    ctxA = await load(userA);
    ctxB = await load(userB);
    ctxNoScope = await load(userC);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  const draftPayload = entryPayloadSchema.parse({
    answers: {
      surveyNo: "42",
      surveyorFirstNameOnPaper: "สมชาย",
      surveyorLastNameOnPaper: "นักสำรวจ",
      respondentFirstName: "ทดสอบ",
      respondentLastName: "ระบบ",
      respondentPhone: "081-234-5678",
      houseNo: "12/3",
      memberCount: 4,
      hasVulnerable: true,
      surveyedAt: "15/03/2568",
      suggestion: "ขอถังน้ำสำรอง",
    },
    marks: { soi: "BLANK_IN_PAPER", coordinateRawText: "ILLEGIBLE" },
    vulnerableRows: [
      {
        prefix: "",
        firstName: "ทดสอบ",
        lastName: "ติดเตียง",
        age: "82",
        phone: "089-000-1111",
        vulnerabilities: [],
        details: {},
      },
    ],
    stepIndex: 3,
  });

  it("saveDraft → payload เข้ารหัสทั้งก้อนใน DB (ไม่มี plaintext) และ loadDraft ถอดกลับได้ครบ", async () => {
    const sheetId = sheetIds[SHEETS[0]];
    const opened = await openSheetByCode(ctxA, SHEETS[0]);
    expect(opened.ok).toBe(true);

    const saved = await saveDraft(ctxA, sheetId, draftPayload);
    expect(saved.ok).toBe(true);

    // ตรวจ "ที่พัก" จริงใน DB — ต้องเป็น ciphertext เท่านั้น
    const attempt = await prisma.entryAttempt.findUniqueOrThrow({
      where: { sheetId_attemptNo: { sheetId, attemptNo: 1 } },
    });
    const stored = attempt.payload as { enc?: string };
    expect(typeof stored.enc).toBe("string");
    expect(isEncrypted(stored.enc!)).toBe(true);
    expect(JSON.stringify(attempt.payload)).not.toContain("ทดสอบ");
    expect(JSON.stringify(attempt.payload)).not.toContain("0812345678");
    expect(attempt.submittedAt).toBeNull();

    const restored = await loadDraftPayload(ctxA, sheetId);
    expect(restored?.answers.respondentFirstName).toBe("ทดสอบ");
    expect(restored?.answers.respondentLastName).toBe("ระบบ");
    expect(restored?.marks.soi).toBe("BLANK_IN_PAPER");
    expect(restored?.vulnerableRows[0]?.firstName).toBe("ทดสอบ");
    expect(restored?.vulnerableRows[0]?.lastName).toBe("ติดเตียง");
    expect(restored?.stepIndex).toBe(3);
  });

  it("ผู้ที่ไม่ใช่เจ้าของ lock บันทึก/อ่านร่างไม่ได้ (NOT_ALLOWED)", async () => {
    const sheetId = sheetIds[SHEETS[0]];
    expect(await saveDraft(ctxB, sheetId, draftPayload)).toEqual({
      ok: false,
      reason: "NOT_ALLOWED",
    });
    expect(await loadDraftPayload(ctxB, sheetId)).toBeNull();
  });

  it("submitEntry → Household เข้ารหัสรายฟิลด์ + blind index + สถานะใบ/ปึก/audit ครบ", async () => {
    const sheetId = sheetIds[SHEETS[0]];
    const payload = entryPayloadSchema.parse({
      ...draftPayload,
      answers: {
        ...draftPayload.answers,
        respondentPrefix: namePrefixId, // FK master — ต้องผ่านและเก็บ plaintext
        surveyorPrefix: namePrefixId,
      },
      vulnerableRows: [
        {
          ...draftPayload.vulnerableRows[0],
          prefix: namePrefixId,
          vulnerabilities: [vulnerabilityTypeId],
          details: { [vulnerabilityTypeId]: "ติดเตียง 2 ปี" },
        },
      ],
    });

    const result = await submitEntry(ctxA, sheetId, payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.duplicateSuspected).toBe(false);

    // ใบปิดเป็น ENTERED_1 + lock ถูกล้าง
    const sheet = await prisma.paperSheet.findUniqueOrThrow({ where: { id: sheetId } });
    expect(sheet.status).toBe(SheetStatus.ENTERED_1);
    expect(sheet.lockedById).toBeNull();

    // Household: ฟิลด์อ่อนไหว = ciphertext ถอดกลับได้ / ฟิลด์ทั่วไปอ่านตรง
    const hh = await prisma.household.findUniqueOrThrow({
      where: { id: result.householdId },
    });
    expect(isEncrypted(hh.respondentFirstName!)).toBe(true);
    expect(decryptText(hh.respondentFirstName!, getKeyring())).toBe("ทดสอบ");
    expect(isEncrypted(hh.respondentLastName!)).toBe(true);
    expect(decryptText(hh.respondentLastName!, getKeyring())).toBe("ระบบ");
    expect(isEncrypted(hh.respondentPhone!)).toBe(true);
    expect(hh.respondentPhoneIdx).toBe(
      phoneBlindIndex("081-234-5678", getSearchHashKey()),
    );
    // ชื่อผู้สำรวจ (staff) แยกส่วน + plaintext (ไม่เข้ารหัส) · คำนำหน้าเป็น FK master
    expect(hh.surveyorFirstNameOnPaper).toBe("สมชาย");
    expect(hh.surveyorLastNameOnPaper).toBe("นักสำรวจ");
    expect(hh.surveyorPrefixId).toBe(namePrefixId);
    expect(hh.respondentPrefixId).toBe(namePrefixId);
    expect(hh.houseNo).toBe("12/3");
    expect(hh.memberCount).toBe(4);
    expect(hh.hasVulnerable).toBe(true);
    expect(hh.surveyedAt?.toISOString()).toBe("2025-03-15T00:00:00.000Z");
    expect(hh.illegibleCount).toBe(1);
    expect(hh.blankCount).toBe(1);

    // กลุ่มเปราะบาง: ชื่อ/เบอร์/รายละเอียดเข้ารหัส + สถานะรายช่อง
    const person = await prisma.vulnerablePerson.findFirstOrThrow({
      where: { householdId: hh.id },
      include: { vulnerabilities: true },
    });
    expect(person.namePrefixId).toBe(namePrefixId); // FK master (plaintext)
    expect(isEncrypted(person.firstName!)).toBe(true);
    expect(decryptText(person.firstName!, getKeyring())).toBe("ทดสอบ");
    expect(isEncrypted(person.lastName!)).toBe(true);
    expect(decryptText(person.lastName!, getKeyring())).toBe("ติดเตียง");
    expect(person.age).toBe(82);
    expect(person.vulnerabilities).toHaveLength(1);
    expect(isEncrypted(person.vulnerabilities[0].detail!)).toBe(true);

    // FieldStatus จาก F2/F3
    const statuses = await prisma.fieldStatus.findMany({ where: { sheetId } });
    expect(statuses.map((s) => `${s.fieldPath}:${s.status}`).sort()).toEqual([
      "coordinateRawText:ILLEGIBLE",
      "soi:BLANK_IN_PAPER",
    ]);

    // ตัวนับปึก + audit
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: AuditAction.CREATE,
        entityType: "Household",
        entityId: hh.id,
      },
    });
    expect(audit).not.toBeNull();

    // EntryAttempt ปิดยอด
    const attempt = await prisma.entryAttempt.findUniqueOrThrow({
      where: { sheetId_attemptNo: { sheetId, attemptNo: 1 } },
    });
    expect(attempt.submittedAt).not.toBeNull();
  });

  it("ส่งซ้ำ / ส่งใบที่ไม่ได้ถือ lock → ปฏิเสธ", async () => {
    const sheetId = sheetIds[SHEETS[0]];
    // ใบถูกปิดเป็น ENTERED_1 แล้ว → NOT_ALLOWED (getSheetForEntry = WRONG_STATUS)
    expect(await submitEntry(ctxA, sheetId, draftPayload)).toEqual({
      ok: false,
      reason: "NOT_ALLOWED",
    });
  });

  it("เบอร์ซ้ำกับใบก่อน → duplicateSuspected + hasDuplicateFlag (จับผ่าน blind index)", async () => {
    const sheetNo = SHEETS[1];
    const opened = await openSheetByCode(ctxB, sheetNo);
    expect(opened.ok).toBe(true);

    const payload = entryPayloadSchema.parse({
      answers: {
        respondentFirstName: "คนละคน",
        respondentLastName: "เบอร์เดียวกัน",
        respondentPhone: "+66 81 234 5678", // รูปแบบต่าง แต่ normalize แล้วตรงใบแรก
        hasVulnerable: false,
      },
    });
    const result = await submitEntry(ctxB, sheetIds[sheetNo], payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.duplicateSuspected).toBe(true);

    const hh = await prisma.household.findUniqueOrThrow({
      where: { id: result.householdId },
    });
    expect(hh.hasDuplicateFlag).toBe(true);
    // ไม่มีเปราะบาง (ติ๊ก "ไม่มี") → hasVulnerable = false และไม่มี person row
    expect(hh.hasVulnerable).toBe(false);
    expect(await prisma.vulnerablePerson.count({ where: { householdId: hh.id } })).toBe(0);
  });

  it("master id ปลอมใน answers → INVALID_MASTER (FK constraint) และไม่ทิ้งข้อมูลครึ่งทาง", async () => {
    const sheetNo = SHEETS[2];
    const opened = await openSheetByCode(ctxA, sheetNo);
    expect(opened.ok).toBe(true);
    const sheetId = sheetIds[sheetNo];

    const payload = entryPayloadSchema.parse({
      answers: { buildingTypeId: "cfake0000000000000000000x" },
    });
    expect(await submitEntry(ctxA, sheetId, payload)).toEqual({
      ok: false,
      reason: "INVALID_MASTER",
    });

    // transaction rollback — ใบยังเป็น LOCKED ของ A และไม่มี Household เกิดขึ้น
    const sheet = await prisma.paperSheet.findUniqueOrThrow({ where: { id: sheetId } });
    expect(sheet.status).toBe(SheetStatus.LOCKED);
    expect(await prisma.household.count({ where: { sheetId } })).toBe(0);
  });

  it("ผู้คีย์ไม่มี community scope เปิดใบได้ (Owner Decision — คีย์ชุมชนไหนก็ได้)", async () => {
    // userC เป็น DATA_ENTRY แต่ไม่มี scope — เดิมจะถูกปฏิเสธ ตอนนี้เปิดใบได้
    expect(ctxNoScope.isGlobalScope).toBe(true);
    expect(ctxNoScope.communityIds).toEqual([]);

    const opened = await openSheetByCode(ctxNoScope, SHEETS[3]);
    expect(opened.ok).toBe(true);

    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { id: sheetIds[SHEETS[3]] },
    });
    expect(sheet.status).toBe(SheetStatus.LOCKED);
    expect(sheet.lockedById).toBe(ctxNoScope.userId);
  });
});
