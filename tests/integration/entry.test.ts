import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, SheetStatus, BatchStatus, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import {
  claimSheetById,
  getEntryOverview,
  getMyActiveSheet,
  getSheetForEntry,
  openSheetByCode,
  releaseSheet,
  renewLock,
} from "../../lib/entry/claim";

// Integration tests — Paper Batch + Sheet ID Entry Workflow (Owner Decision):
// หัวหน้าแจกปึกกระดาษให้เจ้าหน้าที่ → เจ้าหน้าที่เปิดใบด้วยรหัสจากหัวกระดาษ
// ระบบไม่แจกงาน — lock เป็นเพียงกลไกกันเปิดใบเดียวกันซ้อนกัน
// -----------------------------------------------------------------------------
// รันเฉพาะ local dev DB — fixtures สังเคราะห์ล้วน ลบใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  entryA: "test-entry-a@test.invalid",
  entryB: "test-entry-b@test.invalid",
  noScope: "test-entry-noscope@test.invalid",
  noPerm: "test-entry-noperm@test.invalid",
} as const;

const C1_CODE = "TEST-ENTRY-C1";
const C2_CODE = "TEST-ENTRY-C2";
// ปึกถูกยกเลิกแล้ว (Owner Decision 2026-08-03) — ใบ fixture สร้างตรงโดยไม่มีปึก
// ใช้ช่วง SK-99xxxx ซึ่ง SEQUENCE จริงยังไปไม่ถึง จึงไม่ชนกับรหัสที่ระบบออกเอง
const SHEET = (n: number) => `SK-99${String(n).padStart(4, "0")}`;

async function cleanupFixtures() {
  await prisma.paperSheet.deleteMany({
    where: { sheetNo: { startsWith: "SK-99" } },
  });
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(EMAILS) } },
  });
  await prisma.community.deleteMany({
    where: { code: { startsWith: "TEST-ENTRY-" } },
  });
}

describe.skipIf(!isLocalDevDb)("Integration: Paper Batch + Sheet ID Entry", () => {
  let ctxA: AuthorizationContext;
  let ctxB: AuthorizationContext;
  let ctxNoScope: AuthorizationContext;
  let ctxNoPerm: AuthorizationContext;
  let c1Id: string;
  const sheet1Ids: Record<string, string> = {};
  let sheetC2Id: string;

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    await cleanupFixtures();

    const [c1, c2] = await Promise.all([
      prisma.community.create({
        data: { code: C1_CODE, nameTh: "ชุมชนทดสอบเอ็นทรี 1" },
      }),
      prisma.community.create({
        data: { code: C2_CODE, nameTh: "ชุมชนทดสอบเอ็นทรี 2" },
      }),
    ]);
    c1Id = c1.id;

    const mkUser = (email: string) =>
      prisma.user.create({ data: { email, name: `Entry Fixture ${email}` } });
    const userA = await mkUser(EMAILS.entryA);
    const userB = await mkUser(EMAILS.entryB);
    const userNoScope = await mkUser(EMAILS.noScope);
    const userNoPerm = await mkUser(EMAILS.noPerm);

    await prisma.userRole.createMany({
      data: [
        { userId: userA.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
        { userId: userB.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
        { userId: userNoScope.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
        { userId: userNoPerm.id, role: UserRoleEnum.FIELD_SURVEYOR, isActive: true },
      ],
    });
    await prisma.userCommunityScope.createMany({
      data: [
        { userId: userA.id, communityId: c1Id },
        { userId: userB.id, communityId: c1Id },
      ],
    });

    for (let n = 1; n <= 3; n += 1) {
      const sh = await prisma.paperSheet.create({
        data: { communityId: c1Id, sheetNo: SHEET(n) },
      });
      sheet1Ids[SHEET(n)] = sh.id;
    }
    const sc2 = await prisma.paperSheet.create({
      data: { communityId: c2.id, sheetNo: SHEET(4) },
    });
    sheetC2Id = sc2.id;

    const users = [userA, userB, userNoScope, userNoPerm];
    [ctxA, ctxB, ctxNoScope, ctxNoPerm] = await Promise.all(
      users.map((u) =>
        loadContextOrThrow({ id: u.id, name: u.name, email: u.email }),
      ),
    );
  });

  afterAll(async () => {
    await cleanupFixtures();
    const leftovers = await prisma.paperSheet.count({
      where: { sheetNo: { startsWith: "TEST-SHEET-ENTRY-" } },
    });
    expect(leftovers).toBe(0);
    await prisma.$disconnect();
  });

  it("1) ไม่มี survey.entry → NOT_FOUND (ไม่บอกว่าใบมีจริง) และไม่เห็น overview", async () => {
    const opened = await openSheetByCode(ctxNoPerm, SHEET(1));
    expect(opened).toEqual({ ok: false, reason: "NOT_FOUND" });
    const overview = await getEntryOverview(ctxNoPerm);
    expect(overview.allowed).toBe(false);
    expect(overview.communities).toEqual([]);
    expect(await getMyActiveSheet(ctxNoPerm)).toBeNull();
  });

  it("2) ไม่มี community scope แต่ยังคีย์ได้ (Owner Decision — คีย์ชุมชนไหนก็ได้)", async () => {
    const overview = await getEntryOverview(ctxNoScope);
    expect(overview.allowed).toBe(true);
    expect(overview.communities.length).toBeGreaterThan(0);
    // เปิดใบได้แม้ไม่มี scope — ใช้ใบอื่น (ไม่ใช่ 1,1) แล้วคืนสถานะ ไม่รบกวนเทสต์ lock
    const opened = await openSheetByCode(ctxNoScope, SHEET(2));
    expect(opened.ok).toBe(true);
    if (opened.ok) await releaseSheet(ctxNoScope, opened.sheetId);
  });

  it("3) overview เห็นทุกชุมชน (ไม่ผูก scope) พร้อมยอดใบของแต่ละชุมชน", async () => {
    const overview = await getEntryOverview(ctxA);
    expect(overview.allowed).toBe(true);
    const ids = overview.communities.map((c) => c.id);
    expect(ids).toContain(c1Id); // ชุมชนของตน
    expect(overview.communities.length).toBeGreaterThanOrEqual(2); // ต่างชุมชนก็เห็น
    const c1 = overview.communities.find((c) => c.id === c1Id)!;
    expect(c1.totalSheets).toBeGreaterThanOrEqual(3);
  });

  it("4) รหัสไม่มีจริง → NOT_FOUND · ใบต่างชุมชน → เปิดได้ · normalize รหัส", async () => {
    expect(await openSheetByCode(ctxA, "SK-989898")).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    // รูปแบบไม่ตรงกติกา → NOT_FOUND เหมือนกัน ไม่รั่วว่าต่างกันตรงไหน
    expect(await openSheetByCode(ctxA, "TEST-SHEET-9")).toEqual({
      ok: false,
      reason: "NOT_FOUND",
    });
    // ใบอยู่คนละชุมชน (C2) → เปิดได้ แล้วคืนสถานะ
    const c2 = await openSheetByCode(ctxA, SHEET(4));
    expect(c2.ok).toBe(true);
    if (c2.ok) await releaseSheet(ctxA, c2.sheetId);
    // lowercase → normalize ให้ (พิมพ์จากกระดาษ)
    const lower = await openSheetByCode(ctxA, SHEET(2).toLowerCase());
    expect(lower.ok).toBe(true);
    if (lower.ok) {
      await releaseSheet(ctxA, lower.sheetId);
    }
  });

  it("5) สองคนเปิดใบเดียวกันพร้อมกัน → มีเจ้าของคนเดียว (atomic)", async () => {
    const [ra, rb] = await Promise.all([
      openSheetByCode(ctxA, SHEET(1)),
      openSheetByCode(ctxB, SHEET(1)),
    ]);
    const winners = [ra, rb].filter((r) => r.ok);
    const losers = [ra, rb].filter((r) => !r.ok);
    expect(winners.length).toBe(1);
    expect(losers.length).toBe(1);
    expect(losers[0]).toEqual({ ok: false, reason: "IN_USE" });

    const sheet = await prisma.paperSheet.findUnique({
      where: { id: sheet1Ids[SHEET(1)] },
    });
    expect(sheet?.status).toBe(SheetStatus.LOCKED);
    expect([ctxA.userId, ctxB.userId]).toContain(sheet?.lockedById);
    expect(sheet?.lockExpiresAt && sheet.lockExpiresAt > new Date()).toBe(true);
  });

  it("6) เจ้าของเปิดซ้ำด้วยรหัสเดิม → กลับเข้าใบเดิม (resumed) · คนอื่น → IN_USE", async () => {
    const sheet = await prisma.paperSheet.findUnique({
      where: { id: sheet1Ids[SHEET(1)] },
    });
    const holder = sheet!.lockedById === ctxA.userId ? ctxA : ctxB;
    const other = holder === ctxA ? ctxB : ctxA;

    const again = await openSheetByCode(holder, SHEET(1));
    expect(again).toEqual({ ok: true, sheetId: sheet!.id, resumed: true });
    expect(await openSheetByCode(other, SHEET(1))).toEqual({
      ok: false,
      reason: "IN_USE",
    });
  });

  it("7) getSheetForEntry: เจ้าของ OK · คนอื่น NOT_OWNER · ใบ PENDING NOT_LOCKED · ไม่มีสิทธิ์ NOT_FOUND", async () => {
    const sheetId = sheet1Ids[SHEET(1)];
    const sheet = await prisma.paperSheet.findUnique({ where: { id: sheetId } });
    const holder = sheet!.lockedById === ctxA.userId ? ctxA : ctxB;
    const other = holder === ctxA ? ctxB : ctxA;

    const ok = await getSheetForEntry(holder, sheetId);
    expect(ok.kind).toBe("OK");
    expect((await getSheetForEntry(other, sheetId)).kind).toBe("NOT_OWNER");
    // มีสิทธิ์คีย์แต่ไม่ใช่เจ้าของ lock = NOT_OWNER (ไม่เกี่ยว scope แล้ว)
    expect((await getSheetForEntry(ctxNoScope, sheetId)).kind).toBe("NOT_OWNER");
    // ใบ C2 (คนละชุมชน) สถานะ PENDING → NOT_LOCKED = เข้าถึงข้ามชุมชนได้ เสนอให้ claim
    expect((await getSheetForEntry(ctxA, sheetC2Id)).kind).toBe("NOT_LOCKED");
    // ไม่มีสิทธิ์คีย์เลย → NOT_FOUND (กัน IDOR)
    expect((await getSheetForEntry(ctxNoPerm, sheetId)).kind).toBe("NOT_FOUND");
  });

  it("8) renewLock: เจ้าของต่ออายุได้ · คนอื่นไม่ได้", async () => {
    const sheetId = sheet1Ids[SHEET(1)];
    const before = await prisma.paperSheet.findUnique({ where: { id: sheetId } });
    const holder = before!.lockedById === ctxA.userId ? ctxA : ctxB;
    const other = holder === ctxA ? ctxB : ctxA;

    expect((await renewLock(other, sheetId)).ok).toBe(false);
    const renewed = await renewLock(holder, sheetId);
    expect(renewed.ok).toBe(true);
    expect(renewed.lockExpiresAt! >= before!.lockExpiresAt!).toBe(true);
  });

  it("9) lock หมดอายุ → เจ้าของเดิมเห็น LOCK_EXPIRED · ผู้อื่นเปิดด้วยรหัสได้ · renew เดิมไม่ได้", async () => {
    const sheetId = sheet1Ids[SHEET(1)];
    await prisma.paperSheet.update({
      where: { id: sheetId },
      data: { lockExpiresAt: new Date(Date.now() - 60_000) },
    });
    const sheet = await prisma.paperSheet.findUnique({ where: { id: sheetId } });
    const oldHolder = sheet!.lockedById === ctxA.userId ? ctxA : ctxB;
    const other = oldHolder === ctxA ? ctxB : ctxA;

    expect((await getSheetForEntry(oldHolder, sheetId)).kind).toBe("LOCK_EXPIRED");
    expect((await renewLock(oldHolder, sheetId)).ok).toBe(false);

    const taken = await openSheetByCode(other, SHEET(1));
    expect(taken).toEqual({ ok: true, sheetId, resumed: false });
    const after = await prisma.paperSheet.findUnique({ where: { id: sheetId } });
    expect(after?.lockedById).toBe(other.userId);
    expect((await getSheetForEntry(oldHolder, sheetId)).kind).toBe("NOT_OWNER");
  });

  it("10) หยุดคีย์ (release): คนอื่นทำไม่ได้ · เจ้าของทำได้ → กลับ PENDING ล้าง lock", async () => {
    const sheetId = sheet1Ids[SHEET(1)];
    const sheet = await prisma.paperSheet.findUnique({ where: { id: sheetId } });
    const holder = sheet!.lockedById === ctxA.userId ? ctxA : ctxB;
    const other = holder === ctxA ? ctxB : ctxA;

    expect(await releaseSheet(other, sheetId)).toBe(false);
    expect(await releaseSheet(holder, sheetId)).toBe(true);

    const after = await prisma.paperSheet.findUnique({ where: { id: sheetId } });
    expect(after?.status).toBe(SheetStatus.PENDING);
    expect(after?.lockedById).toBeNull();
    expect(after?.lockedAt).toBeNull();
    expect(after?.lockExpiresAt).toBeNull();
  });

  it("11) เปิดด้วยเลขล้วน (normalize เป็น SK-) · ใบสถานะอื่น → WRONG_STATUS", async () => {
    // พิมพ์เฉพาะตัวเลขจากกระดาษ → ระบบเติม SK- และเลข 0 นำหน้าให้
    const byDigits = await openSheetByCode(ctxA, "990001");
    expect(byDigits).toEqual({
      ok: true,
      sheetId: sheet1Ids[SHEET(1)],
      resumed: false,
    });
    await releaseSheet(ctxA, sheet1Ids[SHEET(1)]);

    // ทำใบ 3 เป็น ENTERED_1 → เปิดซ้ำต้องบอกสถานะชัด
    await prisma.paperSheet.update({
      where: { id: sheet1Ids[SHEET(3)] },
      data: { status: SheetStatus.ENTERED_1 },
    });
    const done = await openSheetByCode(ctxA, SHEET(3));
    expect(done).toEqual({
      ok: false,
      reason: "WRONG_STATUS",
      status: SheetStatus.ENTERED_1,
    });
  });

  it("12) claimSheetById: ไม่มี scope ก็ claim ได้ (Owner Decision)", async () => {
    // SHEET(1) เป็น PENDING ณ จุดนี้ (ถูก release ในเทสต์ก่อน)
    const claimed = await claimSheetById(ctxNoScope, sheet1Ids[SHEET(1)]);
    expect(claimed.ok).toBe(true);
    if (claimed.ok) await releaseSheet(ctxNoScope, sheet1Ids[SHEET(1)]);
  });

  it("13) เปิด Wizard ไม่สร้าง Household / EntryAttempt / ไม่มี payload ใดถูกบันทึก", async () => {
    const fixtureSheetIds = [...Object.values(sheet1Ids), sheetC2Id];
    const [households, attempts] = await Promise.all([
      prisma.household.count({ where: { sheetId: { in: fixtureSheetIds } } }),
      prisma.entryAttempt.count({ where: { sheetId: { in: fixtureSheetIds } } }),
    ]);
    expect(households).toBe(0);
    expect(attempts).toBe(0);
  });
});
