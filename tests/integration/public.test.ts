import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, SheetStatus } from "@prisma/client";
import {
  getPublicStats,
  getPublicEmergencyContacts,
  PUBLIC_MIN_AGGREGATE,
} from "../../lib/public/stats";

// Integration tests — Public data layer (ไม่ต้อง login)
// พิสูจน์: คืนเฉพาะ aggregate/ข้อมูลราชการ — ไม่มี PII, Sheet ID, พิกัด หลุดออกไป
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

describe.skipIf(!isLocalDevDb)("Integration: Public data layer", () => {
  beforeAll(async () => {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1) getPublicStats คืนเฉพาะ field ที่อนุญาต (whitelist) — ไม่มีข้อมูลอื่นเล็ดลอด", async () => {
    const stats = await getPublicStats();
    expect(Object.keys(stats).sort()).toEqual(
      ["communities", "evacuationSites", "generatedAt", "tambons", "verifiedHouseholds"].sort(),
    );
    expect(typeof stats.communities).toBe("number");
    expect(typeof stats.tambons).toBe("number");
    expect(typeof stats.verifiedHouseholds).toBe("number");
    expect(typeof stats.evacuationSites).toBe("number");
  });

  it("2) ตัวเลขตรงกับ query อิสระ (เงื่อนไขเดียวกัน) — นับเฉพาะ VERIFIED", async () => {
    const stats = await getPublicStats();
    const [communities, verified] = await Promise.all([
      prisma.community.count({ where: { deletedAt: null, isActive: true } }),
      prisma.household.count({
        where: { deletedAt: null, sheet: { status: SheetStatus.VERIFIED } },
      }),
    ]);
    expect(stats.communities).toBe(communities);
    expect(stats.verifiedHouseholds).toBe(verified);
  });

  it("3) เบอร์ฉุกเฉินคืนเฉพาะ field ราชการ — ไม่มี field บุคคล/พื้นที่ภายใน", async () => {
    const contacts = await getPublicEmergencyContacts();
    for (const c of contacts) {
      expect(Object.keys(c).sort()).toEqual(
        ["category", "id", "isNationwide", "nameTh", "phone"].sort(),
      );
    }
    // ตารางยังไม่มี seed — ต้องไม่พังและไม่ปั้นข้อมูลปลอม
    expect(Array.isArray(contacts)).toBe(true);
  });

  it("4) กติกา k-anonymity threshold ประกาศไว้ ≥ 5", () => {
    expect(PUBLIC_MIN_AGGREGATE).toBeGreaterThanOrEqual(5);
  });
});
