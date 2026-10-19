import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import {
  listAllExternalLinks,
  listPublicExternalLinks,
  saveExternalLink,
  setExternalLinkActive,
} from "../../lib/external-links/core";
import { externalLinkInputSchema, linkHost } from "../../lib/external-links/validation";

// Integration — ลิงก์ระบบภายนอกบนหน้าสาธารณะ (docs/37)
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
const prisma = new PrismaClient();
const EMAILS = ["test-links-admin@test.invalid", "test-links-officer@test.invalid"] as const;
const TITLE = "ZZ ทดสอบลิงก์";

async function cleanup() {
  const users = await prisma.user.findMany({ where: { email: { in: [...EMAILS] } }, select: { id: true } });
  if (users.length) await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { in: [...EMAILS] } } });
  await prisma.externalLink.deleteMany({ where: { title: { startsWith: "ZZ " } } });
}

describe("ลิงก์ระบบภายนอก — ตรวจรูปแบบ (unit)", () => {
  it("รับเฉพาะ https · ปฏิเสธ javascript:/http:/data:", () => {
    const base = { title: "x", category: "RAIN", sortOrder: 1 };
    expect(externalLinkInputSchema.safeParse({ ...base, url: "https://www.tmd.go.th" }).success).toBe(true);
    for (const url of ["http://www.tmd.go.th", "javascript:alert(1)", "data:text/html,x", "https://a b.com", "ftp://x"]) {
      expect(externalLinkInputSchema.safeParse({ ...base, url }).success).toBe(false);
    }
    expect(externalLinkInputSchema.safeParse({ ...base, url: "https://x.th", category: "BOGUS" }).success).toBe(false);
    expect(linkHost("https://www.thaiwater.net/x?y=1")).toBe("thaiwater.net");
  });
});

describe.skipIf(!isLocalDevDb)("Integration: ลิงก์ระบบภายนอก", () => {
  let admin: AuthorizationContext;
  let officer: AuthorizationContext;

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();
    const mk = async (email: string, role: UserRoleEnum) => {
      const u = await prisma.user.create({ data: { email, name: `Fixture ${email}` } });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return loadContextOrThrow({ id: u.id, name: u.name, email: u.email });
    };
    admin = await mk(EMAILS[0], UserRoleEnum.ADMIN);
    officer = await mk(EMAILS[1], UserRoleEnum.OFFICER);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("ADMIN เพิ่ม/แก้/ซ่อนได้ · หน้าสาธารณะเห็นเฉพาะที่เปิดอยู่ · มี Audit", async () => {
    const created = await saveExternalLink(admin, { title: TITLE, url: "https://example.org/a", category: "WATER", sortOrder: 1 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect((await listPublicExternalLinks()).some((l) => l.id === created.id)).toBe(true);

    expect((await saveExternalLink(admin, { id: created.id, title: `${TITLE} 2`, url: "https://example.org/b", category: "RAIN", sortOrder: 2 })).ok).toBe(true);
    expect(await setExternalLinkActive(admin, created.id, false)).toEqual({ ok: true });
    expect((await listPublicExternalLinks()).some((l) => l.id === created.id)).toBe(false);
    expect((await listAllExternalLinks(admin))?.find((l) => l.id === created.id)).toMatchObject({ isActive: false, url: "https://example.org/b" });

    const audits = await prisma.auditLog.count({ where: { userId: admin.userId, entityType: "ExternalLink", entityId: created.id } });
    expect(audits).toBe(3);
  });

  it("บทบาทที่ไม่มีสิทธิ์ตั้งค่าระบบจัดการไม่ได้", async () => {
    expect(await saveExternalLink(officer, { title: TITLE, url: "https://example.org", category: "WATER", sortOrder: 1 })).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(await listAllExternalLinks(officer)).toBeNull();
    expect(await setExternalLinkActive(officer, "x", true)).toEqual({ ok: false, reason: "FORBIDDEN" });
  });

  it("ฐานข้อมูลปฏิเสธลิงก์ที่ไม่ใช่ https แม้ข้ามชั้นแอป (CHECK)", async () => {
    await expect(
      prisma.externalLink.create({ data: { title: `${TITLE} bad`, url: "javascript:alert(1)", category: "WATER" } }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientUnknownRequestError);
  });
});
