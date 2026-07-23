import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  AuditAction,
  BatchStatus,
  PrismaClient,
  SheetStatus,
  UserRoleEnum,
} from "@prisma/client";
import { loadAuthorizationForUser } from "../../lib/authz/load-authorization";
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
} as const;
const C_CODE = "TES1";
const BATCH_CODE = "BATCH-TES-001";
const SHEETS = ["TES-910001", "TES-910002", "TES-910003"];

async function cleanupFixtures() {
  const batch = await prisma.paperBatch.findUnique({ where: { code: BATCH_CODE } });
  if (batch) {
    const households = await prisma.household.findMany({
      where: { batchId: batch.id },
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
    await prisma.fieldStatus.deleteMany({ where: { sheet: { batchId: batch.id } } });
    await prisma.entryAttempt.deleteMany({ where: { sheet: { batchId: batch.id } } });
    await prisma.paperSheet.deleteMany({ where: { batchId: batch.id } });
    await prisma.paperBatch.delete({ where: { id: batch.id } });
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
  let vulnerabilityTypeId: string;
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
    await prisma.userRole.createMany({
      data: [
        { userId: userA.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
        { userId: userB.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
      ],
    });
    await prisma.userCommunityScope.createMany({
      data: [
        { userId: userA.id, communityId: community.id },
        { userId: userB.id, communityId: community.id },
      ],
    });

    const batch = await prisma.paperBatch.create({
      data: {
        code: BATCH_CODE,
        communityId: community.id,
        expectedCount: SHEETS.length,
        receivedAt: new Date(),
        receivedById: userA.id,
        status: BatchStatus.READY_FOR_ENTRY,
      },
    });
    for (const [i, sheetNo] of SHEETS.entries()) {
      const s = await prisma.paperSheet.create({
        data: { batchId: batch.id, sheetNo, sequence: i + 1 },
      });
      sheetIds[sheetNo] = s.id;
    }

    // master data สำหรับ vulnerabilities — ใช้ประเภทแรกที่ seed ไว้
    const vt = await prisma.vulnerabilityType.findFirst({ select: { id: true } });
    if (!vt) throw new Error("ต้องมี VulnerabilityType seed ใน dev DB");
    vulnerabilityTypeId = vt.id;

    const load = (u: { id: string; name: string; email: string }) =>
      loadAuthorizationForUser({ id: u.id, name: u.name, email: u.email });
    ctxA = await load(userA);
    ctxB = await load(userB);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  const draftPayload = entryPayloadSchema.parse({
    answers: {
      surveyNo: "42",
      respondentName: "นางสาวทดสอบ ระบบ",
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
        fullName: "ยายทดสอบ ติดเตียง",
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
    expect(restored?.answers.respondentName).toBe("นางสาวทดสอบ ระบบ");
    expect(restored?.marks.soi).toBe("BLANK_IN_PAPER");
    expect(restored?.vulnerableRows[0]?.fullName).toBe("ยายทดสอบ ติดเตียง");
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
      vulnerableRows: [
        {
          ...draftPayload.vulnerableRows[0],
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
    expect(isEncrypted(hh.respondentName!)).toBe(true);
    expect(decryptText(hh.respondentName!, getKeyring())).toBe("นางสาวทดสอบ ระบบ");
    expect(isEncrypted(hh.respondentPhone!)).toBe(true);
    expect(hh.respondentPhoneIdx).toBe(
      phoneBlindIndex("081-234-5678", getSearchHashKey()),
    );
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
    expect(isEncrypted(person.fullName!)).toBe(true);
    expect(decryptText(person.fullName!, getKeyring())).toBe("ยายทดสอบ ติดเตียง");
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
    const batch = await prisma.paperBatch.findUniqueOrThrow({
      where: { code: BATCH_CODE },
    });
    expect(batch.enteredCount).toBe(1);
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
        respondentName: "คนละคน แต่เบอร์เดียวกัน",
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
});
