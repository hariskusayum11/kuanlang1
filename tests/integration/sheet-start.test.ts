import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, SheetStatus, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { startSheet, listSelectableCommunities } from "../../lib/sheet/create";
import { SHEET_NO_PATTERN } from "../../lib/sheet/number";
import { getSheetForEntry } from "../../lib/entry/claim";

// Integration — ระบบออกรหัสแบบสอบถามตอนผู้คีย์เริ่มกรอก (Owner Decision 2026-08-03)
// ---------------------------------------------------------------------------
// สิ่งที่ต้องพิสูจน์: รหัสไม่ซ้ำแม้สร้างพร้อมกัน · ใบใหม่ไม่มีปึก · จองให้ผู้คีย์ทันที
// รันเฉพาะ local dev DB — fixtures ลบใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  keyer: "test-start-keyer@test.invalid",
  keyer2: "test-start-keyer2@test.invalid",
  noPerm: "test-start-noperm@test.invalid",
} as const;

const C_CODE = "TSS1";

/** เก็บรหัสที่เทสต์นี้สร้าง เพื่อลบเฉพาะของตัวเองใน afterAll */
const created: string[] = [];

async function cleanup() {
  const community = await prisma.community.findFirst({
    where: { code: C_CODE },
    select: { id: true },
  });
  if (community) {
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

describe.skipIf(!isLocalDevDb)("Integration: ระบบออกรหัสแบบสอบถาม", () => {
  let ctxKeyer: AuthorizationContext;
  let ctxKeyer2: AuthorizationContext;
  let ctxNoPerm: AuthorizationContext;
  let communityId = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    const community = await prisma.community.create({
      data: { code: C_CODE, nameTh: "ชุมชนทดสอบออกรหัส" },
    });
    communityId = community.id;

    const mkUser = async (email: string, role: UserRoleEnum) => {
      const u = await prisma.user.create({ data: { email, name: `Fixture ${email}` } });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return u;
    };
    const [keyer, keyer2, noPerm] = await Promise.all([
      mkUser(EMAILS.keyer, UserRoleEnum.DATA_ENTRY),
      mkUser(EMAILS.keyer2, UserRoleEnum.DATA_ENTRY),
      mkUser(EMAILS.noPerm, UserRoleEnum.EXECUTIVE),
    ]);
    [ctxKeyer, ctxKeyer2, ctxNoPerm] = await Promise.all(
      [keyer, keyer2, noPerm].map((u) =>
        loadContextOrThrow({ id: u.id, name: u.name, email: u.email }),
      ),
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("1) เริ่มกรอก → ได้รหัส SK-6หลัก · ไม่มีปึก · จองให้ผู้คีย์ทันที", async () => {
    const r = await startSheet(ctxKeyer, { communityId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    created.push(r.sheetNo);

    expect(SHEET_NO_PATTERN.test(r.sheetNo)).toBe(true);
    expect(r.communityName).toBe("ชุมชนทดสอบออกรหัส");

    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { id: r.sheetId },
      select: {
        sheetNo: true,
        batchId: true,
        sequence: true,
        status: true,
        lockedById: true,
        lockExpiresAt: true,
        communityId: true,
      },
    });
    expect(sheet.sheetNo).toBe(r.sheetNo);
    expect(sheet.batchId).toBeNull(); // ปึกถูกยกเลิกแล้ว
    expect(sheet.sequence).toBeNull(); // ต้อง null คู่กับ batchId ตาม CHECK
    expect(sheet.communityId).toBe(communityId);
    expect(sheet.status).toBe(SheetStatus.LOCKED);
    expect(sheet.lockedById).toBe(ctxKeyer.userId);
    expect(sheet.lockExpiresAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("2) ผู้คีย์เข้า Wizard ของใบที่เพิ่งเริ่มได้ทันที (ไม่ต้อง claim ซ้ำ)", async () => {
    const r = await startSheet(ctxKeyer, { communityId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    created.push(r.sheetNo);

    const access = await getSheetForEntry(ctxKeyer, r.sheetId);
    expect(access.kind).toBe("OK");
    if (access.kind !== "OK") return;
    expect(access.sheet.sheetNo).toBe(r.sheetNo);
  });

  it("3) สร้างพร้อมกัน 12 ใบ → รหัสไม่ซ้ำเลยแม้แต่ใบเดียว", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => startSheet(ctxKeyer, { communityId })),
    );
    expect(results.every((r) => r.ok)).toBe(true);

    const nos = results.flatMap((r) => (r.ok ? [r.sheetNo] : []));
    created.push(...nos);
    expect(new Set(nos).size).toBe(12); // ไม่ซ้ำ
    for (const no of nos) expect(SHEET_NO_PATTERN.test(no)).toBe(true);

    // ยืนยันกับฐานข้อมูลว่ามีครบ 12 แถวจริง ไม่ใช่แค่ค่าที่คืนกลับมา
    const rows = await prisma.paperSheet.findMany({
      where: { sheetNo: { in: nos } },
      select: { sheetNo: true },
    });
    expect(rows).toHaveLength(12);
  });

  it("4) ผู้คีย์คนละคนสร้างพร้อมกัน → ต่างคนต่างได้รหัสของตัวเอง ไม่ชนกัน", async () => {
    const [a, b] = await Promise.all([
      startSheet(ctxKeyer, { communityId }),
      startSheet(ctxKeyer2, { communityId }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    created.push(a.sheetNo, b.sheetNo);

    expect(a.sheetNo).not.toBe(b.sheetNo);
    const rows = await prisma.paperSheet.findMany({
      where: { sheetNo: { in: [a.sheetNo, b.sheetNo] } },
      select: { sheetNo: true, lockedById: true },
    });
    const byNo = new Map(rows.map((r) => [r.sheetNo, r.lockedById]));
    expect(byNo.get(a.sheetNo)).toBe(ctxKeyer.userId);
    expect(byNo.get(b.sheetNo)).toBe(ctxKeyer2.userId);
  });

  it("5) ไม่มีสิทธิ์ survey.entry → FORBIDDEN และไม่กินเลขทิ้ง", async () => {
    const before = await prisma.paperSheet.count({ where: { communityId } });
    const r = await startSheet(ctxNoPerm, { communityId });
    expect(r).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(await prisma.paperSheet.count({ where: { communityId } })).toBe(before);
  });

  it("6) ชุมชนไม่มีจริง → INVALID_COMMUNITY (ไม่สร้างใบทิ้งไว้)", async () => {
    const before = await prisma.paperSheet.count();
    const r = await startSheet(ctxKeyer, { communityId: "clzzzzzzzzzzzzzzzzzzzzzzz" });
    expect(r).toEqual({ ok: false, reason: "INVALID_COMMUNITY" });
    expect(await prisma.paperSheet.count()).toBe(before);
  });

  it("7) ชุมชนที่ปิดใช้งานเลือกไม่ได้ และเริ่มกรอกไม่ได้", async () => {
    const inactive = await prisma.community.create({
      data: { code: "TSS2", nameTh: "ชุมชนปิดใช้งาน", isActive: false },
    });
    try {
      const r = await startSheet(ctxKeyer, { communityId: inactive.id });
      expect(r).toEqual({ ok: false, reason: "INVALID_COMMUNITY" });

      const options = await listSelectableCommunities(ctxKeyer);
      expect(options.some((c) => c.id === inactive.id)).toBe(false);
      expect(options.some((c) => c.id === communityId)).toBe(true);
    } finally {
      await prisma.community.delete({ where: { id: inactive.id } });
    }
  });

  it("8) ผู้ไม่มีสิทธิ์คีย์ → รายการชุมชนว่าง (ไม่รั่วรายชื่อชุมชน)", async () => {
    expect(await listSelectableCommunities(ctxNoPerm)).toEqual([]);
  });

  it("9) การเริ่มกรอกไม่สร้าง Household หรือ EntryAttempt ใด ๆ", async () => {
    const r = await startSheet(ctxKeyer, { communityId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    created.push(r.sheetNo);

    expect(await prisma.household.count({ where: { sheetId: r.sheetId } })).toBe(0);
    expect(await prisma.entryAttempt.count({ where: { sheetId: r.sheetId } })).toBe(0);
  });

  it("10) รหัสที่ออกเรียงเดินหน้าเสมอ ไม่ย้อนกลับไปใช้เลขเดิม", async () => {
    const a = await startSheet(ctxKeyer, { communityId });
    const b = await startSheet(ctxKeyer, { communityId });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    created.push(a.sheetNo, b.sheetNo);

    const numOf = (no: string) => Number(no.slice(3));
    expect(numOf(b.sheetNo)).toBeGreaterThan(numOf(a.sheetNo));
  });
});
