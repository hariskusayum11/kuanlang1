import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  AuditAction,
  BatchStatus,
  FieldStatusEnum,
  PrismaClient,
  SheetStatus,
  UserRoleEnum,
} from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { decryptText, encryptText, phoneBlindIndex } from "../../lib/crypto/encryption";
import { CURRENT_KEY_VERSION, getKeyring, getSearchHashKey } from "../../lib/crypto/keys";
import { loadHouseholdForReview, verifyHousehold } from "../../lib/verification/review";
import { applyHouseholdEdits, loadHouseholdEditable } from "../../lib/verification/edit";
import { resolveDuplicateFlag } from "../../lib/verification/duplicate-resolution";

// Integration — Verifier: review (decrypt + audit READ) + verify (ENTERED_1 → VERIFIED)
// รันเฉพาะ local dev DB — fixtures สังเคราะห์ (TESV-*) ลบใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  verifier: "test-verif-v@test.invalid",
  keyer: "test-verif-k@test.invalid",
  outsider: "test-verif-o@test.invalid",
} as const;
const C1 = "TSV1";
const C2 = "TSV2";
const BATCH_CODE = "BATCH-TSV-001";

async function cleanup() {
  const communities = await prisma.community.findMany({
    where: { code: { in: [C1, C2] } },
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
      await prisma.evacuationVehicle.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.floodRiskProfile.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.householdVersion.deleteMany({ where: { householdId: { in: hids } } });
      await prisma.household.deleteMany({ where: { id: { in: hids } } });
    }
  }
  const batch = await prisma.paperBatch.findUnique({ where: { code: BATCH_CODE } });
  if (batch) {
    await prisma.fieldStatus.deleteMany({ where: { sheet: { batchId: batch.id } } });
    await prisma.paperSheet.deleteMany({ where: { batchId: batch.id } });
    await prisma.paperBatch.delete({ where: { id: batch.id } });
  }
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  if (users.length > 0) {
    const uids = users.map((u) => u.id);
    await prisma.auditLog.deleteMany({ where: { userId: { in: uids } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: { in: [C1, C2] } } });
}

describe.skipIf(!isLocalDevDb)("Integration: Verification (review + verify)", () => {
  let ctxVerifier: AuthorizationContext;
  let ctxKeyer: AuthorizationContext;
  let ctxOutsider: AuthorizationContext;
  let verifierId = "";
  let namePrefixId = "";
  const hh: Record<string, string> = {}; // key → householdId

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const keyring = getKeyring();
    const enc = (v: string) => encryptText(v, keyring, CURRENT_KEY_VERSION);

    const c1 = await prisma.community.create({ data: { code: C1, nameTh: "ชุมชนตรวจสอบ 1" } });
    const c2 = await prisma.community.create({ data: { code: C2, nameTh: "ชุมชนตรวจสอบ 2" } });

    const mkUser = (email: string, role: UserRoleEnum, communityId: string) =>
      prisma.user
        .create({ data: { email, name: `Verif Fixture ${email}` } })
        .then(async (u) => {
          await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
          await prisma.userCommunityScope.create({ data: { userId: u.id, communityId } });
          return u;
        });

    const verifier = await mkUser(EMAILS.verifier, UserRoleEnum.VERIFIER, c1.id);
    const keyer = await mkUser(EMAILS.keyer, UserRoleEnum.DATA_ENTRY, c1.id);
    const outsider = await mkUser(EMAILS.outsider, UserRoleEnum.VERIFIER, c2.id);
    verifierId = verifier.id;

    const batch = await prisma.paperBatch.create({
      data: {
        code: BATCH_CODE,
        communityId: c1.id,
        expectedCount: 3,
        receivedAt: new Date(),
        receivedById: keyer.id,
        status: BatchStatus.IN_PROGRESS,
      },
    });

    // สร้างครัวเรือน 3 ใบในสถานะ ENTERED_1 (ชื่อ/เบอร์เข้ารหัส)
    const mkHousehold = async (key: string, sheetNo: string, enteredById: string) => {
      const sheet = await prisma.paperSheet.create({
        data: {
          communityId: c1.id,
          batchId: batch.id,
          sheetNo,
          sequence: Object.keys(hh).length + 1,
          status: SheetStatus.ENTERED_1,
        },
      });
      const household = await prisma.household.create({
        data: {
          sheetId: sheet.id,
          communityId: c1.id,
          enteredById,
          respondentFirstName: enc("มานี"),
          respondentLastName: enc("ใจดี"),
          respondentPhone: enc("0812223333"),
          houseNo: "9/9",
          hasVulnerable: false,
          illegibleCount: 1,
          blankCount: 2,
        },
      });
      hh[key] = household.id;
    };

    await mkHousehold("byKeyer", "TESV-920001", keyer.id); // ผู้ตรวจไม่ใช่ผู้คีย์ → ยืนยันได้
    await mkHousehold("bySelf", "TESV-920002", verifier.id); // ผู้ตรวจคีย์เอง → SELF_VERIFY
    await mkHousehold("scope", "TESV-920003", keyer.id); // ทดสอบ scope/permission
    await mkHousehold("toEdit", "TESV-920004", keyer.id); // คง ENTERED_1 ไว้ทดสอบแก้ไข
    await prisma.household.update({
      where: { id: hh.toEdit },
      data: {
        assistanceTotalPersonCount: 14,
        hasNoResources: true,
        volunteerNotAvailable: true,
      },
    });
    await prisma.floodRiskProfile.create({
      data: {
        householdId: hh.toEdit,
        hasFloodedBefore: true,
        floodDepthMetersRaw: 1,
        floodDepthCmRaw: 75,
        maxFloodDepthCm: 175,
      },
    });
    await prisma.evacuationVehicle.create({
      data: { householdId: hh.toEdit, vehicleType: "OTHER", detail: "รถอีแต๋น" },
    });
    await mkHousehold("duplicateBase", "TESV-920005", keyer.id);
    await mkHousehold("duplicateNotDuplicate", "TESV-920006", keyer.id);
    await mkHousehold("duplicateConfirmed", "TESV-920007", keyer.id);
    await mkHousehold("duplicateSelf", "TESV-920008", verifier.id);
    await prisma.household.updateMany({
      where: {
        id: {
          in: [hh.duplicateBase, hh.duplicateNotDuplicate, hh.duplicateConfirmed, hh.duplicateSelf],
        },
      },
      data: { houseNo: "55/5", mooNo: 7, soi: "ซอยเดียวกัน", road: "ถนนเดียวกัน" },
    });
    await prisma.household.updateMany({
      where: {
        id: { in: [hh.duplicateNotDuplicate, hh.duplicateConfirmed, hh.duplicateSelf] },
      },
      data: { hasDuplicateFlag: true },
    });

    const np = await prisma.namePrefix.findFirst({ where: { isActive: true }, select: { id: true } });
    if (!np) throw new Error("ต้องมี NamePrefix seed ใน dev DB");
    namePrefixId = np.id;

    const load = (u: { id: string; name: string; email: string }) =>
      loadContextOrThrow({ id: u.id, name: u.name, email: u.email });
    ctxVerifier = await load(verifier);
    ctxKeyer = await load(keyer);
    ctxOutsider = await load(outsider);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("loadHouseholdForReview: ถอดรหัสชื่อ + canConfirm + เขียน Audit READ", async () => {
    const review = await loadHouseholdForReview(ctxVerifier, hh.byKeyer);
    expect(review).not.toBeNull();
    expect(review!.canConfirm).toBe(true);
    expect(review!.enteredByMe).toBe(false);

    const respondent = review!.sections
      .flatMap((s) => s.fields)
      .find((f) => f.label === "ผู้ให้ข้อมูล");
    expect(respondent?.value).toContain("มานี"); // ถอดรหัสสำเร็จ

    const read = await prisma.auditLog.findFirst({
      where: {
        userId: verifierId,
        action: AuditAction.READ,
        entityType: "Household",
        entityId: hh.byKeyer,
      },
    });
    expect(read).not.toBeNull();
  });

  it("verifyHousehold: ENTERED_1 → VERIFIED + verifiedBy + version + audit VERIFY", async () => {
    const result = await verifyHousehold(ctxVerifier, hh.byKeyer);
    expect(result.ok).toBe(true);

    const sheet = await prisma.paperSheet.findFirstOrThrow({
      where: { household: { id: hh.byKeyer } },
    });
    expect(sheet.status).toBe(SheetStatus.VERIFIED);

    const household = await prisma.household.findUniqueOrThrow({ where: { id: hh.byKeyer } });
    expect(household.verifiedById).toBe(verifierId);
    expect(household.verifiedAt).not.toBeNull();

    const batch = await prisma.paperBatch.findUniqueOrThrow({ where: { code: BATCH_CODE } });

    const version = await prisma.householdVersion.findFirstOrThrow({
      where: { householdId: hh.byKeyer },
    });
    expect(version.versionNo).toBe(1);
    expect(version.changedById).toBe(verifierId);

    const audit = await prisma.auditLog.findFirst({
      where: { action: AuditAction.VERIFY, entityType: "Household", entityId: hh.byKeyer },
    });
    expect(audit).not.toBeNull();
  });

  it("ยืนยันซ้ำใบที่ VERIFIED แล้ว → WRONG_STATUS", async () => {
    expect(await verifyHousehold(ctxVerifier, hh.byKeyer)).toEqual({
      ok: false,
      reason: "WRONG_STATUS",
    });
  });

  it("ผู้คีย์ยืนยันงานตัวเองไม่ได้ → SELF_VERIFY (แยกหน้าที่)", async () => {
    expect(await verifyHousehold(ctxVerifier, hh.bySelf)).toEqual({
      ok: false,
      reason: "SELF_VERIFY",
    });
    // ใบยังคง ENTERED_1 (ไม่ถูกเปลี่ยนสถานะ)
    const sheet = await prisma.paperSheet.findFirstOrThrow({
      where: { household: { id: hh.bySelf } },
    });
    expect(sheet.status).toBe(SheetStatus.ENTERED_1);
  });

  it("ผู้ตรวจต่างชุมชนตรวจได้แล้ว — Community Scope ถูกยกเลิก (#R7-B)", async () => {
    // เดิมตอบ NOT_FOUND เพราะผูกชุมชน · ตอนนี้ทุกบัญชีเห็นทุกชุมชน
    // สิ่งที่ยังกันอยู่คือ permission และกฎห้ามตรวจงานตัวเอง
    expect(await loadHouseholdForReview(ctxOutsider, hh.scope)).not.toBeNull();
  });

  it("ไม่มีสิทธิ์ verification.view (DATA_ENTRY) → NOT_ALLOWED / review = null", async () => {
    expect(await loadHouseholdForReview(ctxKeyer, hh.scope)).toBeNull();
    expect(await verifyHousehold(ctxKeyer, hh.scope)).toEqual({
      ok: false,
      reason: "NOT_ALLOWED",
    });
  });

  it("ธงซ้ำที่ยังไม่ตัดสิน: แสดงใบที่ตรงกันและห้ามยืนยัน VERIFIED", async () => {
    const review = await loadHouseholdForReview(ctxVerifier, hh.duplicateNotDuplicate);
    expect(review?.canResolveDuplicate).toBe(true);
    expect(review?.canConfirm).toBe(false);
    expect(review?.duplicateCandidates.map((candidate) => candidate.householdId)).toContain(
      hh.duplicateBase,
    );
    expect(await verifyHousehold(ctxVerifier, hh.duplicateNotDuplicate)).toEqual({
      ok: false,
      reason: "DUPLICATE_UNRESOLVED",
    });
  });

  it("ผู้ตรวจยืนยันว่าไม่ซ้ำ → ล้างธง, เก็บผู้ตัดสิน และยืนยันใบต่อได้", async () => {
    expect(
      await resolveDuplicateFlag(ctxVerifier, hh.duplicateNotDuplicate, "NOT_DUPLICATE"),
    ).toEqual({ ok: true, decision: "NOT_DUPLICATE" });

    const household = await prisma.household.findUniqueOrThrow({
      where: { id: hh.duplicateNotDuplicate },
    });
    expect(household.hasDuplicateFlag).toBe(false);
    expect(household.duplicateResolution).toBe("NOT_DUPLICATE");
    expect(household.duplicateResolvedById).toBe(verifierId);
    expect(household.duplicateResolvedAt).not.toBeNull();
    expect((await verifyHousehold(ctxVerifier, hh.duplicateNotDuplicate)).ok).toBe(true);
  });

  it("ผู้ตรวจยืนยันว่าซ้ำจริง → คงธงและห้ามยืนยันเป็นครัวเรือนใหม่", async () => {
    expect(
      await resolveDuplicateFlag(ctxVerifier, hh.duplicateConfirmed, "CONFIRMED_DUPLICATE"),
    ).toEqual({ ok: true, decision: "CONFIRMED_DUPLICATE" });

    const household = await prisma.household.findUniqueOrThrow({
      where: { id: hh.duplicateConfirmed },
    });
    expect(household.hasDuplicateFlag).toBe(true);
    expect(household.duplicateResolution).toBe("CONFIRMED_DUPLICATE");
    expect(await verifyHousehold(ctxVerifier, hh.duplicateConfirmed)).toEqual({
      ok: false,
      reason: "CONFIRMED_DUPLICATE",
    });
  });

  it("ผู้คีย์ตัดสินธงซ้ำของใบตัวเองไม่ได้", async () => {
    expect(
      await resolveDuplicateFlag(ctxVerifier, hh.duplicateSelf, "NOT_DUPLICATE"),
    ).toEqual({ ok: false, reason: "SELF_RESOLVE" });
  });

  // ---- Slice 2: แก้ไขข้อมูล ----

  it("หน้าแก้ไขเติมค่าความช่วยเหลือรวมและระดับน้ำเดิม", async () => {
    const editable = await loadHouseholdEditable(ctxVerifier, hh.toEdit);
    expect(editable?.values.assistanceTotalPersonCount).toBe("14");
    expect(editable?.values.floodDepthMetersRaw).toBe("1");
    expect(editable?.values.floodDepthCmRaw).toBe("75");
    expect(editable?.values.hasNoResources).toBe(true);
    expect(editable?.values.volunteerNotAvailable).toBe(true);
  });

  it("หน้าแก้ไขเติมข้อความยานพาหนะอื่น ๆ เดิม และบันทึกค่าที่แก้กลับได้", async () => {
    const editable = await loadHouseholdEditable(ctxVerifier, hh.toEdit);
    expect(editable?.values.evacuationVehicleTypes).toContain("OTHER");
    expect(editable?.values.evacuationVehiclesOther).toBe("รถอีแต๋น");

    expect(
      await applyHouseholdEdits(ctxVerifier, hh.toEdit, {
        evacuationVehiclesOther: "รถหกล้อ",
      }),
    ).toEqual({ ok: true, changedCount: 1 });

    const other = await prisma.evacuationVehicle.findFirstOrThrow({
      where: { householdId: hh.toEdit, vehicleType: "OTHER" },
    });
    expect(other.detail).toBe("รถหกล้อ");
  });

  it("applyHouseholdEdits: แก้ชื่อ(🔒)/เบอร์(idx)/บ้านเลขที่/สมาชิก/คำนำหน้า(FK) + version + audit", async () => {
    const result = await applyHouseholdEdits(ctxVerifier, hh.toEdit, {
      respondentFirstName: "สมหญิง",
      houseNo: "10/10",
      respondentPhone: "0899998888",
      memberCount: "5",
      respondentPrefixId: namePrefixId,
    });
    expect(result).toEqual({ ok: true, changedCount: 5 });

    const household = await prisma.household.findUniqueOrThrow({ where: { id: hh.toEdit } });
    expect(decryptText(household.respondentFirstName!, getKeyring())).toBe("สมหญิง"); // เข้ารหัสใหม่
    expect(household.houseNo).toBe("10/10");
    expect(decryptText(household.respondentPhone!, getKeyring())).toBe("0899998888");
    expect(household.respondentPhoneIdx).toBe(
      phoneBlindIndex("0899998888", getSearchHashKey()),
    ); // blind index คำนวณใหม่
    expect(household.memberCount).toBe(5);
    expect(household.respondentPrefixId).toBe(namePrefixId); // FK master

    const version = await prisma.householdVersion.findFirstOrThrow({
      where: { householdId: hh.toEdit },
      orderBy: { versionNo: "desc" },
    });
    expect(version.versionNo).toBe(2);
    expect(version.changedById).toBe(verifierId);
    expect(version.changeReason).toBe("verifier-edit");

    const audit = await prisma.auditLog.findFirst({
      where: { action: "UPDATE", entityType: "Household", entityId: hh.toEdit },
    });
    expect(audit).not.toBeNull();

    // ใบยังเป็น ENTERED_1 (การแก้ไม่เปลี่ยนสถานะ — ยังต้องยืนยันแยก)
    const sheet = await prisma.paperSheet.findFirstOrThrow({
      where: { household: { id: hh.toEdit } },
    });
    expect(sheet.status).toBe(SheetStatus.ENTERED_1);
  });

  it("แก้ค่าเดิม (ไม่เปลี่ยน) → changedCount 0 ไม่สร้าง version ใหม่", async () => {
    const before = await prisma.householdVersion.count({ where: { householdId: hh.toEdit } });
    const result = await applyHouseholdEdits(ctxVerifier, hh.toEdit, { houseNo: "10/10" });
    expect(result).toEqual({ ok: true, changedCount: 0 });
    const after = await prisma.householdVersion.count({ where: { householdId: hh.toEdit } });
    expect(after).toBe(before);
  });

  it("หน้าแก้ไขโหลด F2/F3 เดิม และแก้ค่าจริงแล้วปิดสถานะเดิมได้", async () => {
    const sheet = await prisma.paperSheet.findFirstOrThrow({
      where: { household: { id: hh.toEdit } },
      select: { id: true },
    });
    await prisma.fieldStatus.createMany({
      data: [
        { sheetId: sheet.id, fieldPath: "soi", status: FieldStatusEnum.BLANK_IN_PAPER },
        { sheetId: sheet.id, fieldPath: "road", status: FieldStatusEnum.ILLEGIBLE },
      ],
    });
    await prisma.household.update({
      where: { id: hh.toEdit },
      data: { blankCount: 1, illegibleCount: 1 },
    });

    const editable = await loadHouseholdEditable(ctxVerifier, hh.toEdit);
    expect(editable?.fieldMarks).toMatchObject({
      soi: "BLANK_IN_PAPER",
      road: "ILLEGIBLE",
    });

    const result = await applyHouseholdEdits(
      ctxVerifier,
      hh.toEdit,
      { soi: "ซอยที่อ่านได้แล้ว" },
      { soi: null },
    );
    expect(result).toEqual({ ok: true, changedCount: 2 });

    const latestSoi = await prisma.fieldStatus.findFirstOrThrow({
      where: { sheetId: sheet.id, fieldPath: "soi" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    expect(latestSoi.status).toBe(FieldStatusEnum.HAS_VALUE);
    const household = await prisma.household.findUniqueOrThrow({ where: { id: hh.toEdit } });
    expect(household.soi).toBe("ซอยที่อ่านได้แล้ว");
    expect(household.blankCount).toBe(0);
    expect(household.illegibleCount).toBe(1);
  });

  it("คำนำหน้าปลอม (FK ผิด) → INVALID_MASTER และ rollback (ไม่มี version เพิ่ม)", async () => {
    const before = await prisma.householdVersion.count({ where: { householdId: hh.toEdit } });
    expect(
      await applyHouseholdEdits(ctxVerifier, hh.toEdit, {
        respondentPrefixId: "cfake0000000000000000000x",
      }),
    ).toEqual({ ok: false, reason: "INVALID_MASTER" });
    const after = await prisma.householdVersion.count({ where: { householdId: hh.toEdit } });
    expect(after).toBe(before); // transaction rollback
  });

  it("ผู้คีย์แก้งานตัวเอง / ไม่มีสิทธิ์ → ปฏิเสธตามเหตุ", async () => {
    expect(await applyHouseholdEdits(ctxVerifier, hh.bySelf, { houseNo: "1" })).toEqual({
      ok: false,
      reason: "SELF_EDIT",
    });
    expect(await applyHouseholdEdits(ctxKeyer, hh.toEdit, { houseNo: "1" })).toEqual({
      ok: false,
      reason: "NOT_ALLOWED",
    });
  });

  it("แก้ไขใบที่ยืนยันแล้ว → WRONG_STATUS (แก้ได้เฉพาะ ENTERED_1)", async () => {
    expect((await verifyHousehold(ctxVerifier, hh.toEdit)).ok).toBe(true);
    expect(await applyHouseholdEdits(ctxVerifier, hh.toEdit, { houseNo: "99" })).toEqual({
      ok: false,
      reason: "WRONG_STATUS",
    });
  });
});
