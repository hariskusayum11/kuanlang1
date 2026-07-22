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
import {
  closeBatch,
  createBatch,
  getBatchDetail,
  listBatches,
  openBatchForEntry,
} from "../../lib/batch/core";
import { openSheetByCode } from "../../lib/entry/claim";

// Integration tests — Batch Management: รับปึก → เปิดให้คีย์ → ปิดปึก
// -----------------------------------------------------------------------------
// รันเฉพาะ local dev DB — fixtures สังเคราะห์ (code ขึ้นต้น TB/BATCH-TB) ลบใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  manager: "test-batch-manager@test.invalid", // COORDINATOR scope C1
  keyer: "test-batch-keyer@test.invalid", // DATA_ENTRY scope C1
  noPerm: "test-batch-noperm@test.invalid", // DATA_ENTRY (ไม่มี batch.manage)
} as const;
const C1_CODE = "TB1";
const C2_CODE = "TB2";
// เลขพิมพ์สังเคราะห์ ช่วงสูงพอไม่ชนข้อมูล dev อื่น
const RANGE = "910001-910005";
const RANGE_NUMBERS = ["910001", "910002", "910003", "910004", "910005"];

async function cleanupFixtures() {
  await prisma.paperSheet.deleteMany({
    where: { batch: { code: { startsWith: "BATCH-TB" } } },
  });
  await prisma.paperBatch.deleteMany({
    where: { code: { startsWith: "BATCH-TB" } },
  });
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
  }
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(EMAILS) } },
  });
  await prisma.community.deleteMany({
    where: { code: { in: [C1_CODE, C2_CODE] } },
  });
}

describe.skipIf(!isLocalDevDb)("Integration: Batch Management", () => {
  let managerCtx: AuthorizationContext;
  let keyerCtx: AuthorizationContext;
  let noPermCtx: AuthorizationContext;
  let c1Id: string;
  let c2Id: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    await cleanupFixtures();

    const [c1, c2] = await Promise.all([
      prisma.community.create({
        data: { code: C1_CODE, nameTh: "ชุมชนทดสอบปึก 1" },
      }),
      prisma.community.create({
        data: { code: C2_CODE, nameTh: "ชุมชนทดสอบปึก 2" },
      }),
    ]);
    c1Id = c1.id;
    c2Id = c2.id;

    const mkUser = (email: string) =>
      prisma.user.create({ data: { email, name: `Batch Fixture ${email}` } });
    const manager = await mkUser(EMAILS.manager);
    const keyer = await mkUser(EMAILS.keyer);
    const noPerm = await mkUser(EMAILS.noPerm);

    await prisma.userRole.createMany({
      data: [
        { userId: manager.id, role: UserRoleEnum.COORDINATOR, isActive: true },
        { userId: keyer.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
        { userId: noPerm.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
      ],
    });
    await prisma.userCommunityScope.createMany({
      data: [
        { userId: manager.id, communityId: c1Id },
        { userId: keyer.id, communityId: c1Id },
        { userId: noPerm.id, communityId: c1Id },
      ],
    });

    const load = (u: { id: string; name: string; email: string }) =>
      loadAuthorizationForUser({ id: u.id, name: u.name, email: u.email });
    managerCtx = await load(manager);
    keyerCtx = await load(keyer);
    noPermCtx = await load(noPerm);
  });

  afterAll(async () => {
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  let printedBatchId: string;

  it("รับปึกโหมด PRINTED (ช่วงเลข) → สร้างใบครบ เรียง sequence + audit CREATE", async () => {
    const result = await createBatch(managerCtx, {
      communityId: c1Id,
      handedOverBy: "ผู้ประสานทดสอบ",
      storageLocation: "ตู้ T ช่อง 1",
      numbering: { mode: "PRINTED", numbersText: RANGE },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    printedBatchId = result.batchId;
    expect(result.code).toBe(`BATCH-${C1_CODE}-001`);
    expect(result.sheetCount).toBe(5);

    const sheets = await prisma.paperSheet.findMany({
      where: { batchId: result.batchId },
      orderBy: { sequence: "asc" },
    });
    expect(sheets.map((s) => s.sheetNo)).toEqual(RANGE_NUMBERS);
    expect(sheets.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(sheets.every((s) => s.status === SheetStatus.PENDING)).toBe(true);

    const batch = await prisma.paperBatch.findUniqueOrThrow({
      where: { id: result.batchId },
    });
    expect(batch.status).toBe(BatchStatus.RECEIVED);
    expect(batch.expectedCount).toBe(5);

    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: managerCtx.userId,
        action: AuditAction.CREATE,
        entityType: "PaperBatch",
        entityId: result.batchId,
      },
    });
    expect(audit).not.toBeNull();
  });

  it("เลขชนกับใบที่มีอยู่ → SHEET_CONFLICT พร้อมรายการเลข", async () => {
    const result = await createBatch(managerCtx, {
      communityId: c1Id,
      numbering: { mode: "PRINTED", numbersText: "910004-910008" },
    });
    expect(result).toMatchObject({ ok: false, reason: "SHEET_CONFLICT" });
    if (result.ok || result.reason !== "SHEET_CONFLICT") return;
    expect(result.conflicts).toEqual(
      expect.arrayContaining(["910004", "910005"]),
    );
  });

  it("ข้อความเลขเพี้ยน → PARSE_ERROR พร้อมข้อความไทย", async () => {
    const result = await createBatch(managerCtx, {
      communityId: c1Id,
      numbering: { mode: "PRINTED", numbersText: "910010 ??bad" },
    });
    expect(result).toMatchObject({ ok: false, reason: "PARSE_ERROR" });
  });

  it("โหมด AUTO → ระบบรันเลข SHEET-<ชุมชน>-<ปึก>-<ลำดับ>", async () => {
    const result = await createBatch(managerCtx, {
      communityId: c1Id,
      numbering: { mode: "AUTO", count: 3 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sheets = await prisma.paperSheet.findMany({
      where: { batchId: result.batchId },
      orderBy: { sequence: "asc" },
      select: { sheetNo: true },
    });
    expect(sheets.map((s) => s.sheetNo)).toEqual([
      `SHEET-${C1_CODE}-002-001`,
      `SHEET-${C1_CODE}-002-002`,
      `SHEET-${C1_CODE}-002-003`,
    ]);
  });

  it("RBAC/scope: นอก scope ชุมชน → FORBIDDEN, ไม่มี batch.manage → FORBIDDEN", async () => {
    expect(
      await createBatch(managerCtx, {
        communityId: c2Id, // manager มี scope แค่ C1
        numbering: { mode: "AUTO", count: 1 },
      }),
    ).toEqual({ ok: false, reason: "FORBIDDEN" });

    expect(
      await createBatch(noPermCtx, {
        communityId: c1Id,
        numbering: { mode: "AUTO", count: 1 },
      }),
    ).toEqual({ ok: false, reason: "FORBIDDEN" });

    expect(await listBatches(noPermCtx)).toBeNull();
  });

  it("listBatches เห็นเฉพาะปึกใน scope", async () => {
    // สร้างปึกใน C2 ตรงผ่าน prisma (นอก scope ของ manager)
    await prisma.paperBatch.create({
      data: {
        code: "BATCH-TB2-999",
        communityId: c2Id,
        expectedCount: 1,
        receivedAt: new Date(),
        receivedById: managerCtx.userId,
      },
    });
    const rows = (await listBatches(managerCtx)) ?? [];
    const codes = rows.map((r) => r.code);
    expect(codes).toContain(`BATCH-${C1_CODE}-001`);
    expect(codes).not.toContain("BATCH-TB2-999");
  });

  it("getBatchDetail: awaitingNumbers ครบ — นอก scope → null", async () => {
    const detail = await getBatchDetail(managerCtx, printedBatchId);
    expect(detail).not.toBeNull();
    expect(detail!.awaitingNumbers).toEqual(RANGE_NUMBERS);
    expect(detail!.totalSheets).toBe(5);

    const c2Batch = await prisma.paperBatch.findUniqueOrThrow({
      where: { code: "BATCH-TB2-999" },
    });
    expect(await getBatchDetail(managerCtx, c2Batch.id)).toBeNull();
  });

  it("เปิดปึกให้คีย์ → READY_FOR_ENTRY แล้วเจ้าหน้าที่คีย์เปิดใบจากเลขพิมพ์ได้จริง", async () => {
    const opened = await openBatchForEntry(managerCtx, printedBatchId);
    expect(opened).toEqual({ ok: true });

    // เปิดซ้ำ → WRONG_STATUS (updateMany แบบมีเงื่อนไข)
    expect(await openBatchForEntry(managerCtx, printedBatchId)).toEqual({
      ok: false,
      reason: "WRONG_STATUS",
    });

    // Cross-module: คนคีย์พิมพ์เลขจากหัวกระดาษ → ระบบหาใบ+ปึกให้เอง
    const openSheet = await openSheetByCode(keyerCtx, "910003");
    expect(openSheet.ok).toBe(true);
  });

  it("ปิดปึกที่ยังมีใบค้าง → HAS_UNFINISHED; เคลียร์ครบแล้วปิดได้ + ปิดซ้ำ → WRONG_STATUS", async () => {
    expect(await closeBatch(managerCtx, printedBatchId)).toEqual({
      ok: false,
      reason: "HAS_UNFINISHED",
    });

    // จำลองจบงาน: 4 ใบ VERIFIED, 1 ใบหาย
    await prisma.paperSheet.updateMany({
      where: { batchId: printedBatchId, sheetNo: { not: "910005" } },
      data: { status: SheetStatus.VERIFIED, lockedById: null, lockExpiresAt: null },
    });
    await prisma.paperSheet.updateMany({
      where: { batchId: printedBatchId, sheetNo: "910005" },
      data: { status: SheetStatus.SHEET_LOST, lostReason: "ทดสอบใบหาย" },
    });

    expect(await closeBatch(managerCtx, printedBatchId)).toEqual({ ok: true });
    const batch = await prisma.paperBatch.findUniqueOrThrow({
      where: { id: printedBatchId },
    });
    expect(batch.status).toBe(BatchStatus.CLOSED);
    expect(batch.closedById).toBe(managerCtx.userId);

    expect(await closeBatch(managerCtx, printedBatchId)).toEqual({
      ok: false,
      reason: "WRONG_STATUS",
    });
  });
});
