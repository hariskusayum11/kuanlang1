import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, SheetStatus, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { createBatch, registerSheet } from "../../lib/batch/core";
import { openSheetByCode } from "../../lib/entry/claim";
import { entryPayloadSchema } from "../../lib/entry/payload";
import { saveDraft, submitEntry } from "../../lib/entry/save";
import { getVerificationOverview } from "../../lib/verification/queue";
import { loadHouseholdForReview, verifyHousehold } from "../../lib/verification/review";
import { groupVerificationQueue, UNBATCHED_LABEL } from "../../domain/verification/group-queue";

// Integration — Batch เป็นทางเลือก (Owner Decision 2026-08-01 #R6-B/#R6-F)
// ---------------------------------------------------------------------------
// ใบกระดาษ (PaperSheet) เป็นเจ้าของชุมชนของตัวเอง ปึกเป็นเพียงข้อมูลบริหารงาน
// ทุกขั้นตอน คีย์ → ส่ง → ตรวจ → ยืนยัน ต้องทำงานได้แม้ใบไม่ได้อยู่ในปึกใด
//
// การลงทะเบียนใบเป็นหน้าที่ของผู้รับเอกสาร (`batch.manage`) ไม่ใช่ผู้คีย์ —
// เป็นด่านยืนยันว่ากระดาษมีอยู่จริงและอยู่ชุมชนใด (Owner Decision 2026-08-01)
//
// รันเฉพาะ local dev DB — fixtures สังเคราะห์ (TOB-*) ลบใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  officer: "test-optbatch-officer@test.invalid", // OFFICER — scope C1 + C2
  officerC1: "test-optbatch-officer-c1@test.invalid", // OFFICER — scope C1 เท่านั้น
  officerGlobal: "test-optbatch-officer-glb@test.invalid", // OFFICER — hasGlobalCommunityScope
  admin: "test-optbatch-admin@test.invalid", // ADMIN — ไม่มี scope แถว (global ตาม role)
  keyer: "test-optbatch-keyer@test.invalid", // DATA_ENTRY — ไม่มี scope
  verifierC1: "test-optbatch-verif-c1@test.invalid", // VERIFIER — scope C1
  verifierC2: "test-optbatch-verif-c2@test.invalid", // VERIFIER — scope C2
} as const;

const C1_CODE = "TOB1";
const C2_CODE = "TOB2";
const SHEET_PREFIX = "TOB-SHEET-";

async function cleanup() {
  const communities = await prisma.community.findMany({
    where: { code: { in: [C1_CODE, C2_CODE] } },
    select: { id: true },
  });
  const cids = communities.map((c) => c.id);
  if (cids.length > 0) {
    const households = await prisma.household.findMany({
      where: { communityId: { in: cids } },
      select: { id: true },
    });
    const hids = households.map((h) => h.id);
    if (hids.length > 0) {
      await prisma.householdVersion.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.assistanceNeed.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.personVulnerability.deleteMany({
        where: { person: { householdId: { in: hids } } },
      });
      await prisma.vulnerablePerson.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.household.deleteMany({ where: { id: { in: hids } } });
    }
    await prisma.fieldStatus.deleteMany({ where: { sheet: { communityId: { in: cids } } } });
    await prisma.entryAttempt.deleteMany({ where: { sheet: { communityId: { in: cids } } } });
    await prisma.paperSheet.deleteMany({ where: { communityId: { in: cids } } });
    await prisma.paperBatch.deleteMany({ where: { communityId: { in: cids } } });
  }
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  if (users.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: { in: [C1_CODE, C2_CODE] } } });
}

/** payload ขั้นต่ำสำหรับ submit — เนื้อหาไม่ใช่ประเด็นของชุดทดสอบนี้ */
const MINIMAL_PAYLOAD = entryPayloadSchema.parse({
  answers: { houseNo: "1/1", memberCount: 2, hasVulnerable: false },
});

describe.skipIf(!isLocalDevDb)("Integration: Batch เป็นทางเลือก (#R6-F)", () => {
  let ctxOfficer: AuthorizationContext;
  let ctxOfficerC1: AuthorizationContext;
  let ctxOfficerGlobal: AuthorizationContext;
  let ctxAdmin: AuthorizationContext;
  let ctxKeyer: AuthorizationContext;
  let ctxVerifierC1: AuthorizationContext;
  let ctxVerifierC2: AuthorizationContext;
  let c1Id = "";
  let c2Id = "";

  /** ใบที่ไม่ได้อยู่ในปึก — batchId/sequence เป็น null คู่กันตาม CHECK */
  const makeUnbatchedSheet = (sheetNo: string, communityId: string) =>
    prisma.paperSheet.create({
      data: {
        communityId,
        sheetNo,
        batchId: null,
        sequence: null,
        status: SheetStatus.PENDING,
      },
      select: { id: true, sheetNo: true },
    });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();

    const [c1, c2] = await Promise.all([
      prisma.community.create({ data: { code: C1_CODE, nameTh: "ชุมชนทดสอบใบนอกปึก 1" } }),
      prisma.community.create({ data: { code: C2_CODE, nameTh: "ชุมชนทดสอบใบนอกปึก 2" } }),
    ]);
    c1Id = c1.id;
    c2Id = c2.id;

    const mkUser = async (
      email: string,
      role: UserRoleEnum,
      communityIds: string[],
      hasGlobalCommunityScope = false,
    ) => {
      const u = await prisma.user.create({
        data: { email, name: `OptBatch Fixture ${email}`, hasGlobalCommunityScope },
      });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      if (communityIds.length > 0) {
        await prisma.userCommunityScope.createMany({
          data: communityIds.map((communityId) => ({ userId: u.id, communityId })),
        });
      }
      return u;
    };

    const [officer, officerC1, officerGlobal, admin, keyer, verifierC1, verifierC2] =
      await Promise.all([
        mkUser(EMAILS.officer, UserRoleEnum.OFFICER, [c1.id, c2.id]),
        mkUser(EMAILS.officerC1, UserRoleEnum.OFFICER, [c1.id]),
        mkUser(EMAILS.officerGlobal, UserRoleEnum.OFFICER, [], true),
        mkUser(EMAILS.admin, UserRoleEnum.ADMIN, []),
        mkUser(EMAILS.keyer, UserRoleEnum.DATA_ENTRY, []),
        mkUser(EMAILS.verifierC1, UserRoleEnum.VERIFIER, [c1.id]),
        mkUser(EMAILS.verifierC2, UserRoleEnum.VERIFIER, [c2.id]),
      ]);

    const load = (u: { id: string; name: string; email: string }) =>
      loadContextOrThrow({ id: u.id, name: u.name, email: u.email });
    [
      ctxOfficer,
      ctxOfficerC1,
      ctxOfficerGlobal,
      ctxAdmin,
      ctxKeyer,
      ctxVerifierC1,
      ctxVerifierC2,
    ] = await Promise.all([
      load(officer),
      load(officerC1),
      load(officerGlobal),
      load(admin),
      load(keyer),
      load(verifierC1),
      load(verifierC2),
    ]);

    await makeUnbatchedSheet(`${SHEET_PREFIX}SOLO-001`, c1Id);
    await makeUnbatchedSheet(`${SHEET_PREFIX}SOLO-002`, c1Id);
    await makeUnbatchedSheet(`${SHEET_PREFIX}C2-001`, c2Id);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // Flow ปึกเดิมต้องไม่ถูกกระทบ
  // -------------------------------------------------------------------------

  it("1) Flow ปึกเดิมยังทำงาน — createBatch สร้างใบพร้อม communityId + sequence เรียงจาก 1", async () => {
    const created = await createBatch(ctxOfficer, {
      communityId: c1Id,
      numbering: {
        mode: "PRINTED",
        numbersText: `${SHEET_PREFIX}B1-001, ${SHEET_PREFIX}B1-002`,
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const sheets = await prisma.paperSheet.findMany({
      where: { batchId: created.batchId },
      orderBy: { sequence: "asc" },
    });
    expect(sheets.map((s) => s.sequence)).toEqual([1, 2]);
    expect(sheets.every((s) => s.communityId === c1Id)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // คีย์ → ส่ง → ตรวจ → ยืนยัน บนใบที่ไม่มีปึก
  // -------------------------------------------------------------------------

  it("2) เปิดใบที่ไม่มีปึกด้วยรหัสเต็มได้ · เลขลำดับสั้นโดยไม่ระบุปึก → NOT_FOUND", async () => {
    const opened = await openSheetByCode(ctxKeyer, `${SHEET_PREFIX}SOLO-001`);
    expect(opened.ok).toBe(true);

    // ไม่ระบุปึก = sequence เดี่ยว ๆ ไม่ระบุใบได้ (#R6-F)
    expect(await openSheetByCode(ctxKeyer, "1")).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("3) Save Draft + Submit บนใบที่ไม่มีปึก → สำเร็จ ไม่ throw และไม่แตะตัวนับปึกใด", async () => {
    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { sheetNo: `${SHEET_PREFIX}SOLO-001` },
      select: { id: true },
    });
    const batchesBefore = await prisma.paperBatch.findMany({
      where: { communityId: { in: [c1Id, c2Id] } },
      select: { id: true, receivedCount: true, enteredCount: true, verifiedCount: true },
      orderBy: { id: "asc" },
    });

    expect((await saveDraft(ctxKeyer, sheet.id, MINIMAL_PAYLOAD)).ok).toBe(true);
    const submitted = await submitEntry(ctxKeyer, sheet.id, MINIMAL_PAYLOAD);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    const stored = await prisma.paperSheet.findUniqueOrThrow({ where: { id: sheet.id } });
    expect(stored.status).toBe(SheetStatus.ENTERED_1);
    expect(stored.batchId).toBeNull();

    // Household ยึดชุมชนจากใบ ไม่ใช่จากปึก
    const household = await prisma.household.findUniqueOrThrow({
      where: { id: submitted.householdId },
      select: { communityId: true, sheetId: true },
    });
    expect(household.communityId).toBe(c1Id);
    expect(household.sheetId).toBe(sheet.id);

    const batchesAfter = await prisma.paperBatch.findMany({
      where: { communityId: { in: [c1Id, c2Id] } },
      select: { id: true, receivedCount: true, enteredCount: true, verifiedCount: true },
      orderBy: { id: "asc" },
    });
    expect(batchesAfter).toEqual(batchesBefore);
  });

  it("4) Review + Verify ใบที่ไม่มีปึก → สำเร็จ · batchCode = null (ไม่ใช่สตริงว่าง)", async () => {
    const household = await prisma.household.findFirstOrThrow({
      where: { communityId: c1Id, sheet: { batchId: null } },
      select: { id: true },
    });

    const review = await loadHouseholdForReview(ctxVerifierC1, household.id);
    expect(review).not.toBeNull();
    expect(review?.batchCode).toBeNull();

    expect(await verifyHousehold(ctxVerifierC1, household.id)).toEqual({ ok: true });
    const sheet = await prisma.paperSheet.findFirstOrThrow({
      where: { household: { id: household.id } },
      select: { status: true, batchId: true },
    });
    expect(sheet.status).toBe(SheetStatus.VERIFIED);
    expect(sheet.batchId).toBeNull();
  });

  it("5) Authorization ยึด PaperSheet.communityId — ผู้ตรวจต่างชุมชนมองไม่เห็นใบที่ไม่มีปึก", async () => {
    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { sheetNo: `${SHEET_PREFIX}C2-001` },
      select: { id: true },
    });
    expect((await openSheetByCode(ctxKeyer, `${SHEET_PREFIX}C2-001`)).ok).toBe(true);
    const submitted = await submitEntry(ctxKeyer, sheet.id, MINIMAL_PAYLOAD);
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    // ผู้ตรวจชุมชน 2 เห็น · ผู้ตรวจชุมชน 1 ไม่เห็น (ทั้งที่ใบไม่มีปึกให้ยึด scope)
    expect(await loadHouseholdForReview(ctxVerifierC2, submitted.householdId)).not.toBeNull();
    expect(await loadHouseholdForReview(ctxVerifierC1, submitted.householdId)).toBeNull();
    expect(await verifyHousehold(ctxVerifierC1, submitted.householdId)).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
  });

  it("6) คิวตรวจ: ใบที่ไม่มีปึกรวมเป็นกลุ่มป้ายไทย ไม่ส่ง null ดิบไปแสดง", async () => {
    const overview = await getVerificationOverview(ctxVerifierC2);
    expect(overview.allowed).toBe(true);
    const item = overview.queue.find((q) => q.sheetNo === `${SHEET_PREFIX}C2-001`);
    expect(item).toBeDefined();
    expect(item?.batchId).toBeNull();
    expect(item?.batchCode).toBeNull();

    const groups = groupVerificationQueue(overview.queue);
    const c2Group = groups.find((g) => g.communityId === c2Id);
    expect(c2Group).toBeDefined();
    const unbatched = c2Group?.batches.find((b) => b.batchId === null);
    expect(unbatched?.batchLabel).toBe(UNBATCHED_LABEL);
    expect(unbatched?.count).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // ข้อบังคับระดับฐานข้อมูล + ไม่มีร่องรอย Household.batchId
  // -------------------------------------------------------------------------

  it("7) ตาราง household ไม่มีคอลัมน์ batchId แล้ว (อ่านผ่าน sheet เท่านั้น)", async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'household' AND column_name = 'batchId'
    `;
    expect(columns).toEqual([]);
  });

  it("8) CHECK (batchId IS NULL) = (sequence IS NULL) — ใส่ครึ่งเดียวไม่ได้", async () => {
    const batch = await prisma.paperBatch.findFirstOrThrow({
      where: { communityId: c1Id },
      select: { id: true },
    });
    // ใบนอกปึกห้ามมี sequence
    await expect(
      prisma.paperSheet.create({
        data: {
          communityId: c1Id,
          sheetNo: `${SHEET_PREFIX}BAD-001`,
          batchId: null,
          sequence: 99,
        },
      }),
    ).rejects.toThrow();
    // ใบในปึกต้องมี sequence
    await expect(
      prisma.paperSheet.create({
        data: {
          communityId: c1Id,
          sheetNo: `${SHEET_PREFIX}BAD-002`,
          batchId: batch.id,
          sequence: null,
        },
      }),
    ).rejects.toThrow();
  });

  it("9) UNIQUE (batchId, sequence) เฉพาะใบที่อยู่ในปึก — ใบนอกปึกไม่ติดกฎนี้", async () => {
    const batch = await prisma.paperBatch.findFirstOrThrow({
      where: { communityId: c1Id },
      select: { id: true },
    });
    await expect(
      prisma.paperSheet.create({
        data: {
          communityId: c1Id,
          sheetNo: `${SHEET_PREFIX}DUP-SEQ`,
          batchId: batch.id,
          sequence: 1, // ชนกับใบแรกของปึก
        },
      }),
    ).rejects.toThrow();

    // ใบนอกปึกหลายใบ (batchId = null, sequence = null) ต้องอยู่ร่วมกันได้
    const soloCount = await prisma.paperSheet.count({
      where: { communityId: c1Id, batchId: null },
    });
    expect(soloCount).toBeGreaterThan(1);
  });

  // -------------------------------------------------------------------------
  // ลงทะเบียนแบบสอบถาม — ผู้รับเอกสารเท่านั้น (Owner Decision 2026-08-01)
  // -------------------------------------------------------------------------

  it("10) OFFICER ลงทะเบียนใบโดยไม่เลือกปึกได้ — batchId/sequence เป็น null คู่กัน", async () => {
    const result = await registerSheet(ctxOfficer, {
      sheetNo: `${SHEET_PREFIX}REG-001`,
      communityId: c1Id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batchCode).toBeNull();
    expect(result.sequence).toBeNull();

    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { sheetNo: `${SHEET_PREFIX}REG-001` },
    });
    expect(sheet.batchId).toBeNull();
    expect(sheet.sequence).toBeNull();
    expect(sheet.communityId).toBe(c1Id);
    expect(sheet.status).toBe(SheetStatus.PENDING);
  });

  it("11) OFFICER แบบ scoped สร้างได้เฉพาะชุมชนในสิทธิ์ — นอก scope → FORBIDDEN", async () => {
    const inScope = await registerSheet(ctxOfficerC1, {
      sheetNo: `${SHEET_PREFIX}REG-C1`,
      communityId: c1Id,
    });
    expect(inScope.ok).toBe(true);

    const outOfScope = await registerSheet(ctxOfficerC1, {
      sheetNo: `${SHEET_PREFIX}REG-C2-DENIED`,
      communityId: c2Id,
    });
    expect(outOfScope).toEqual({ ok: false, reason: "FORBIDDEN" });
    // ปฏิเสธแล้วต้องไม่มีแถวหลงเหลือ
    expect(
      await prisma.paperSheet.count({ where: { sheetNo: `${SHEET_PREFIX}REG-C2-DENIED` } }),
    ).toBe(0);
  });

  it("12) OFFICER ที่มีธง hasGlobalCommunityScope สร้างได้ทุกชุมชน", async () => {
    expect(ctxOfficerGlobal.isGlobalScope).toBe(true);
    expect(ctxOfficerGlobal.communityIds).toHaveLength(0);
    for (const [i, cid] of [c1Id, c2Id].entries()) {
      const r = await registerSheet(ctxOfficerGlobal, {
        sheetNo: `${SHEET_PREFIX}REG-GLB-${i}`,
        communityId: cid,
      });
      expect(r.ok).toBe(true);
    }
  });

  it("13) DATA_ENTRY เรียก registerSheet ตรง ๆ ไม่ได้ (ไม่มี batch.manage)", async () => {
    const result = await registerSheet(ctxKeyer, {
      sheetNo: `${SHEET_PREFIX}REG-KEYER`,
      communityId: c1Id,
    });
    expect(result).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(
      await prisma.paperSheet.count({ where: { sheetNo: `${SHEET_PREFIX}REG-KEYER` } }),
    ).toBe(0);
  });

  it("14) ADMIN สร้างได้ (ALL_PERMISSIONS + global scope)", async () => {
    const result = await registerSheet(ctxAdmin, {
      sheetNo: `${SHEET_PREFIX}REG-ADMIN`,
      communityId: c2Id,
    });
    expect(result.ok).toBe(true);
  });

  it("15) เลือกปึก → ใช้ชุมชนของปึก + sequence ต่อท้ายปึก และตัวนับปึกเพิ่มตามจริง", async () => {
    const created = await createBatch(ctxOfficer, {
      communityId: c2Id,
      numbering: { mode: "PRINTED", numbersText: `${SHEET_PREFIX}B2-001` },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const before = await prisma.paperBatch.findUniqueOrThrow({
      where: { id: created.batchId },
      select: { expectedCount: true, receivedCount: true },
    });

    const result = await registerSheet(ctxOfficer, {
      sheetNo: `${SHEET_PREFIX}REG-INBATCH`,
      communityId: c2Id,
      batchId: created.batchId,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.batchCode).toBe(created.code);
    expect(result.sequence).toBe(2); // ต่อจากใบเดิมของปึก

    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { sheetNo: `${SHEET_PREFIX}REG-INBATCH` },
    });
    expect(sheet.batchId).toBe(created.batchId);
    expect(sheet.communityId).toBe(c2Id);

    const after = await prisma.paperBatch.findUniqueOrThrow({
      where: { id: created.batchId },
      select: { expectedCount: true, receivedCount: true },
    });
    expect(after.expectedCount).toBe(before.expectedCount + 1);
    expect(after.receivedCount).toBe(before.receivedCount + 1);
  });

  it("16) ปึกคนละชุมชนกับ communityId ที่ส่งมา → COMMUNITY_MISMATCH (ไม่เขียนทับเงียบ ๆ)", async () => {
    const batchC2 = await prisma.paperBatch.findFirstOrThrow({
      where: { communityId: c2Id },
      select: { id: true },
    });
    const result = await registerSheet(ctxOfficer, {
      sheetNo: `${SHEET_PREFIX}REG-MISMATCH`,
      communityId: c1Id, // client อ้างชุมชน 1 แต่ปึกอยู่ชุมชน 2
      batchId: batchC2.id,
    });
    expect(result).toEqual({ ok: false, reason: "COMMUNITY_MISMATCH" });
    expect(
      await prisma.paperSheet.count({ where: { sheetNo: `${SHEET_PREFIX}REG-MISMATCH` } }),
    ).toBe(0);
  });

  it("17) รหัสแบบสอบถามซ้ำ → SHEET_CONFLICT · รูปแบบผิด → INVALID_SHEET_NO", async () => {
    const dup = await registerSheet(ctxOfficer, {
      sheetNo: `${SHEET_PREFIX}REG-001`, // สร้างไปแล้วในเคส 10
      communityId: c1Id,
    });
    expect(dup).toEqual({ ok: false, reason: "SHEET_CONFLICT" });

    const bad = await registerSheet(ctxOfficer, {
      sheetNo: "ใบที่ ๑", // ไม่ผ่านกติกา [A-Za-z0-9-]
      communityId: c1Id,
    });
    expect(bad).toEqual({ ok: false, reason: "INVALID_SHEET_NO" });
  });

  it("18) ลงทะเบียนใบไม่สร้าง Household/EntryAttempt และไม่เก็บข้อมูลบุคคลใด", async () => {
    const result = await registerSheet(ctxOfficer, {
      sheetNo: `${SHEET_PREFIX}REG-EMPTY`,
      communityId: c1Id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(await prisma.household.count({ where: { sheetId: result.sheetId } })).toBe(0);
    expect(await prisma.entryAttempt.count({ where: { sheetId: result.sheetId } })).toBe(0);
    expect(await prisma.fieldStatus.count({ where: { sheetId: result.sheetId } })).toBe(0);

    // Audit ต้องมีร่องรอย แต่ต้องไม่พก payload ใด ๆ ติดไปด้วย
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "PaperSheet", entityId: result.sheetId },
      select: { action: true, userId: true, changes: true },
    });
    expect(audit?.action).toBe("CREATE");
    expect(audit?.userId).toBe(ctxOfficer.userId);
    expect(audit?.changes ?? null).toBeNull();
  });

  it("19) ใบที่เพิ่งลงทะเบียน — DATA_ENTRY เปิดด้วยรหัสเต็มได้ทันที (ไม่ต้องมีปึก)", async () => {
    const registered = await registerSheet(ctxOfficer, {
      sheetNo: `${SHEET_PREFIX}REG-OPEN`,
      communityId: c1Id,
    });
    expect(registered.ok).toBe(true);
    if (!registered.ok) return;

    const opened = await openSheetByCode(ctxKeyer, `${SHEET_PREFIX}REG-OPEN`);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(opened.sheetId).toBe(registered.sheetId);

    // เปิดได้จริง = ถูกจองให้ผู้คีย์ และยังไม่มีปึกผูกอยู่
    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { id: registered.sheetId },
      select: { batchId: true, status: true, lockedById: true },
    });
    expect(sheet.batchId).toBeNull();
    expect(sheet.status).toBe(SheetStatus.LOCKED);
    expect(sheet.lockedById).toBe(ctxKeyer.userId);
  });

  it("20) ปึกที่ปิดแล้วรับใบเพิ่มไม่ได้ → BATCH_CLOSED", async () => {
    const created = await createBatch(ctxOfficer, {
      communityId: c1Id,
      numbering: { mode: "PRINTED", numbersText: `${SHEET_PREFIX}B3-001` },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await prisma.paperBatch.update({
      where: { id: created.batchId },
      data: { status: "CLOSED" },
    });

    const result = await registerSheet(ctxOfficer, {
      sheetNo: `${SHEET_PREFIX}REG-CLOSED`,
      communityId: c1Id,
      batchId: created.batchId,
    });
    expect(result).toEqual({ ok: false, reason: "BATCH_CLOSED" });
  });

  it("21) ลงทะเบียนพร้อมกันในปึกเดียวกัน → sequence ไม่ซ้ำ ไม่มีใบตกหล่น (retry ทำงาน)", async () => {
    const created = await createBatch(ctxOfficer, {
      communityId: c1Id,
      numbering: { mode: "PRINTED", numbersText: `${SHEET_PREFIX}B4-001` },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // ยิงพร้อมกัน — ทุกตัวอ่าน max(sequence) ได้ค่าเดียวกันก่อนใครเขียนสำเร็จ
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        registerSheet(ctxOfficer, {
          sheetNo: `${SHEET_PREFIX}RACE-00${n}`,
          communityId: c1Id,
          batchId: created.batchId,
        }),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);

    const sheets = await prisma.paperSheet.findMany({
      where: { batchId: created.batchId },
      orderBy: { sequence: "asc" },
      select: { sequence: true },
    });
    // 1 ใบจาก createBatch + 4 ใบที่แข่งกัน → ลำดับต้องเรียง 1..5 ไม่ซ้ำ ไม่ข้าม
    expect(sheets.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5]);

    const batch = await prisma.paperBatch.findUniqueOrThrow({
      where: { id: created.batchId },
      select: { expectedCount: true, receivedCount: true },
    });
    expect(batch.expectedCount).toBe(5);
    expect(batch.receivedCount).toBe(5);
  });

  it("22) ปึกที่ไม่มีจริง → BATCH_NOT_FOUND (ไม่ยอมสร้างใบทิ้งไว้)", async () => {
    const result = await registerSheet(ctxOfficer, {
      sheetNo: `${SHEET_PREFIX}REG-NOBATCH`,
      communityId: c1Id,
      batchId: "clzzzzzzzzzzzzzzzzzzzzzzz",
    });
    expect(result).toEqual({ ok: false, reason: "BATCH_NOT_FOUND" });
    expect(
      await prisma.paperSheet.count({ where: { sheetNo: `${SHEET_PREFIX}REG-NOBATCH` } }),
    ).toBe(0);
  });
});
