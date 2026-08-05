import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, AuditAction, SheetStatus, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { startSheet } from "../../lib/sheet/create";
import { changeSheetCommunity } from "../../lib/entry/claim";

// Integration — เปลี่ยนชุมชนของใบที่กำลังคีย์ (เลือกผิดตอนเริ่ม · Owner feedback)
// สิ่งที่ต้องพิสูจน์: เฉพาะคนถือ lock เปลี่ยนได้ · รหัสเดิมคงอยู่ · Audit UPDATE เก็บ old→new
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

const EMAILS = {
  keyer: "test-chgcom-keyer@test.invalid",
  keyer2: "test-chgcom-keyer2@test.invalid",
  noPerm: "test-chgcom-noperm@test.invalid",
} as const;

const CODES = ["TCC1", "TCC2"] as const;

async function cleanup() {
  const communities = await prisma.community.findMany({
    where: { code: { in: [...CODES] } },
    select: { id: true },
  });
  if (communities.length > 0) {
    const ids = communities.map((c) => c.id);
    await prisma.entryAttempt.deleteMany({ where: { sheet: { communityId: { in: ids } } } });
    await prisma.paperSheet.deleteMany({ where: { communityId: { in: ids } } });
  }
  const users = await prisma.user.findMany({
    where: { email: { in: Object.values(EMAILS) } },
    select: { id: true },
  });
  if (users.length > 0) {
    await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  }
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
  await prisma.community.deleteMany({ where: { code: { in: [...CODES] } } });
}

describe.skipIf(!isLocalDevDb)("Integration: เปลี่ยนชุมชนของใบที่กำลังคีย์", () => {
  let ctxKeyer: AuthorizationContext;
  let ctxKeyer2: AuthorizationContext;
  let ctxNoPerm: AuthorizationContext;
  let communityA = "";
  let communityB = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    const [a, b] = await Promise.all([
      prisma.community.create({ data: { code: CODES[0], nameTh: "ชุมชนต้นทาง" } }),
      prisma.community.create({ data: { code: CODES[1], nameTh: "ชุมชนปลายทาง" } }),
    ]);
    communityA = a.id;
    communityB = b.id;

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

  it("1) คนถือ lock เปลี่ยนชุมชนได้ · รหัสเดิมคงอยู่ · Audit UPDATE เก็บ old→new", async () => {
    const started = await startSheet(ctxKeyer, { communityId: communityA });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const r = await changeSheetCommunity(ctxKeyer, started.sheetId, communityB);
    expect(r).toEqual({ ok: true, communityName: "ชุมชนปลายทาง" });

    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { id: started.sheetId },
      select: { sheetNo: true, communityId: true, status: true, lockedById: true },
    });
    expect(sheet.communityId).toBe(communityB); // ย้ายชุมชนแล้ว
    expect(sheet.sheetNo).toBe(started.sheetNo); // รหัสไม่เปลี่ยน (#R7-A)
    expect(sheet.status).toBe(SheetStatus.LOCKED);
    expect(sheet.lockedById).toBe(ctxKeyer.userId);

    const audit = await prisma.auditLog.findFirst({
      where: {
        userId: ctxKeyer.userId,
        action: AuditAction.UPDATE,
        entityType: "PaperSheet",
        entityId: started.sheetId,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect(audit?.changes).toMatchObject({
      communityId: { old: communityA, new: communityB },
    });
  });

  it("2) เลือกชุมชนเดิมซ้ำ → ok แบบ no-op (ไม่เขียน Audit เพิ่ม)", async () => {
    const started = await startSheet(ctxKeyer, { communityId: communityA });
    if (!started.ok) return;

    const before = await prisma.auditLog.count({
      where: { entityType: "PaperSheet", entityId: started.sheetId },
    });
    const r = await changeSheetCommunity(ctxKeyer, started.sheetId, communityA);
    expect(r.ok).toBe(true);
    const after = await prisma.auditLog.count({
      where: { entityType: "PaperSheet", entityId: started.sheetId },
    });
    expect(after).toBe(before); // ไม่มีการเปลี่ยนจริง → ไม่เขียน audit
  });

  it("3) ชุมชนปลายทางไม่มีจริง → INVALID_COMMUNITY (ไม่แตะใบ)", async () => {
    const started = await startSheet(ctxKeyer, { communityId: communityA });
    if (!started.ok) return;

    const r = await changeSheetCommunity(ctxKeyer, started.sheetId, "clzzzzzzzzzzzzzzzzzzzzzzz");
    expect(r).toEqual({ ok: false, reason: "INVALID_COMMUNITY" });

    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { id: started.sheetId },
      select: { communityId: true },
    });
    expect(sheet.communityId).toBe(communityA); // ไม่เปลี่ยน
  });

  it("4) คนที่ไม่ได้ถือ lock ใบนี้ → NOT_HOLDING (ป้องกันคนอื่นย้ายชุมชนใบเรา)", async () => {
    const started = await startSheet(ctxKeyer, { communityId: communityA });
    if (!started.ok) return;

    const r = await changeSheetCommunity(ctxKeyer2, started.sheetId, communityB);
    expect(r).toEqual({ ok: false, reason: "NOT_HOLDING" });

    const sheet = await prisma.paperSheet.findUniqueOrThrow({
      where: { id: started.sheetId },
      select: { communityId: true },
    });
    expect(sheet.communityId).toBe(communityA); // คงเดิม
  });

  it("5) ไม่มีสิทธิ์ survey.entry → FORBIDDEN", async () => {
    const started = await startSheet(ctxKeyer, { communityId: communityA });
    if (!started.ok) return;

    const r = await changeSheetCommunity(ctxNoPerm, started.sheetId, communityB);
    expect(r).toEqual({ ok: false, reason: "FORBIDDEN" });
  });
});
