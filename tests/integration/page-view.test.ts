import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PageViewAudience, UserRoleEnum } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { recordPageView } from "../../lib/usage/page-view";
import { loadUsageDashboard } from "../../lib/usage/dashboard";
import { loadContextOrThrow } from "../helpers/authz";

// วันในอนาคตไกล ๆ เพื่อไม่ชนยอดจริงของ dev DB และลบทิ้งได้ปลอดภัย
const FIXTURE_NOW = new Date("2099-01-15T05:00:00Z"); // 2099-01-15 เวลาไทย
const FIXTURE_DAY = new Date("2099-01-15T00:00:00Z");
const TAG = `pv-${Date.now()}`;

async function countFor(path: string, audience: PageViewAudience): Promise<number> {
  const row = await prisma.pageViewDaily.findUnique({
    where: { day_path_audience: { day: FIXTURE_DAY, path, audience } },
  });
  return row?.count ?? 0;
}

const userIds: string[] = [];

async function makeUser(role: UserRoleEnum) {
  const user = await prisma.user.create({
    data: {
      email: `${TAG}-${role.toLowerCase()}@example.test`,
      name: `Usage ${role}`,
      isActive: true,
      userRoles: { create: { role } },
    },
  });
  userIds.push(user.id);
  return user;
}

beforeAll(async () => {
  await prisma.pageViewDaily.deleteMany({ where: { day: FIXTURE_DAY } });
});

afterAll(async () => {
  await prisma.pageViewDaily.deleteMany({ where: { day: FIXTURE_DAY } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("Integration: page_view_daily", () => {
  it("ตารางไม่มีคอลัมน์ IP / User Agent / ผู้ใช้ — มีเพียง day, path, audience, count", async () => {
    const columns = await prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'page_view_daily'
    `;
    const names = columns.map((c) => c.column_name).sort();
    expect(names).toEqual(["audience", "count", "day", "path"]);
    for (const forbidden of [/ip/i, /agent/i, /user/i, /session/i, /email/i]) {
      expect(names.some((name) => forbidden.test(name))).toBe(false);
    }
  });

  it("upsert เพิ่มยอดแบบ atomic — 25 ครั้งพร้อมกันได้ 25 พอดี (ไม่มีแถวซ้ำ)", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => recordPageView("/dashboard", PageViewAudience.SIGNED_IN, FIXTURE_NOW)),
    );
    expect(results.every((r) => r === "RECORDED")).toBe(true);
    expect(await countFor("/dashboard", PageViewAudience.SIGNED_IN)).toBe(25);
    const rows = await prisma.pageViewDaily.count({ where: { day: FIXTURE_DAY, path: "/dashboard" } });
    expect(rows).toBe(1);
  });

  it("แยกกลุ่มผู้ชมเป็นคนละแถว และเก็บเฉพาะรูปแบบเส้นทาง", async () => {
    await recordPageView("/", PageViewAudience.PUBLIC, FIXTURE_NOW);
    await recordPageView("/?ref=line", PageViewAudience.PUBLIC, FIXTURE_NOW);
    await recordPageView("/", PageViewAudience.SIGNED_IN, FIXTURE_NOW);
    await recordPageView("/verification/cm1234567890abcdef", PageViewAudience.SIGNED_IN, FIXTURE_NOW);
    expect(await countFor("/", PageViewAudience.PUBLIC)).toBe(2);
    expect(await countFor("/", PageViewAudience.SIGNED_IN)).toBe(1);
    expect(await countFor("/verification/[householdId]", PageViewAudience.SIGNED_IN)).toBe(1);

    const stored = await prisma.pageViewDaily.findMany({ where: { day: FIXTURE_DAY }, select: { path: true } });
    expect(stored.some((row) => row.path.includes("cm1234567890abcdef") || row.path.includes("?"))).toBe(false);
  });

  it("path ที่ไม่ควรนับคืน SKIPPED และไม่เขียนแถว", async () => {
    expect(await recordPageView("/api/page-view", PageViewAudience.PUBLIC, FIXTURE_NOW)).toBe("SKIPPED");
    expect(await recordPageView("/logo.svg", PageViewAudience.PUBLIC, FIXTURE_NOW)).toBe("SKIPPED");
    expect(await prisma.pageViewDaily.count({ where: { day: FIXTURE_DAY, path: { startsWith: "/api" } } })).toBe(0);
  });

  it("CHECK constraint กันยอดติดลบและ path ที่ไม่ใช่รูปแบบเส้นทาง", async () => {
    await expect(
      prisma.$executeRaw`INSERT INTO "page_view_daily" ("day","path","audience","count") VALUES ('2099-01-15'::date, '/x?name=a', 'PUBLIC', 1)`,
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`INSERT INTO "page_view_daily" ("day","path","audience","count") VALUES ('2099-01-15'::date, '/neg', 'PUBLIC', -1)`,
    ).rejects.toThrow();
  });
});

describe("Integration: loadUsageDashboard RBAC", () => {
  it("ADMIN โหลดได้ · ผู้ไม่มี settings.view ถูกปฏิเสธฝั่ง server", async () => {
    const admin = await loadContextOrThrow(await makeUser(UserRoleEnum.ADMIN));
    const result = await loadUsageDashboard(admin, FIXTURE_NOW);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.window.days).toHaveLength(30);
      expect(result.data.window.endDay).toBe("2099-01-15");
      // ยอดของ fixture วันนี้ถูกนับในอนุกรม
      const today = result.data.pageViews.series[result.data.pageViews.series.length - 1];
      expect(today.values.SIGNED_IN).toBeGreaterThanOrEqual(27);
      expect(today.values.PUBLIC).toBeGreaterThanOrEqual(2);
      expect(result.data.logins.activeAccounts).toBeGreaterThan(0);
    }

    for (const role of [UserRoleEnum.EXECUTIVE, UserRoleEnum.DATA_ENTRY, UserRoleEnum.OFFICER]) {
      const ctx = await loadContextOrThrow(await makeUser(role));
      expect(await loadUsageDashboard(ctx, FIXTURE_NOW)).toEqual({ ok: false, reason: "FORBIDDEN" });
    }
  });
});
