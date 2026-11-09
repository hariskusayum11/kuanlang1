import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, UserRoleEnum } from "@prisma/client";
import { loadContextOrThrow } from "../helpers/authz";
import type { AuthorizationContext } from "../../lib/authz/types";
import { getActiveFlagCriteria, getFlagCriteriaPageData, saveFlagCriteria } from "../../lib/water/flag-criteria";
import { DEFAULT_FLAG_CRITERIA, type FlagCriteriaConfig } from "../../domain/water/community-flags";

// Integration — เกณฑ์ธงเตือนภัยแบบมีเวอร์ชัน (docs/44)
// ---------------------------------------------------------------------------
// กติกาที่ต้องพิสูจน์:
//   1. แก้ได้เฉพาะ flag-criteria.manage (ADMIN) — ตรวจที่ server ไม่ใช่แค่ซ่อนเมนู
//   2. บันทึก = เวอร์ชันใหม่ ไม่ทับของเดิม + Audit Log รายการที่เปลี่ยน · ค่าที่ค้าง (ฐานเก่า) ถูกปฏิเสธ
//   3. เกณฑ์ที่ไม่สมเหตุสมผล (ระดับสูงต่ำกว่าระดับต่ำ) ถูกปฏิเสธที่ server แม้ข้ามตัวแก้มา
//   4. หน้าแรกอ่านเกณฑ์ฉบับล่าสุด (รวมระดับที่เพิ่ม เช่น ธงส้ม)
// ⚠️ DB ใช้ร่วมกับ session อื่น — ลบเฉพาะเวอร์ชันที่เทสต์สร้าง
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);
const prisma = new PrismaClient();

const EMAILS = { admin: "test-flags-admin@test.invalid", officer: "test-flags-officer@test.invalid" } as const;
let baselineVersion = 0;

async function cleanup() {
  await prisma.flagCriteriaVersion.deleteMany({ where: { versionNo: { gt: baselineVersion } } });
  const users = await prisma.user.findMany({ where: { email: { in: Object.values(EMAILS) } }, select: { id: true } });
  if (users.length) await prisma.auditLog.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await prisma.user.deleteMany({ where: { email: { in: Object.values(EMAILS) } } });
}

const withOrange = (base: FlagCriteriaConfig): FlagCriteriaConfig => {
  const c = structuredClone(base);
  if (!c.levels.some((l) => l.key === "ORANGE_TEST")) {
    const redAt = c.levels.findIndex((l, i) => i > 0 && l.color === "red");
    c.levels.splice(redAt > 0 ? redAt : c.levels.length, 0, {
      key: "ORANGE_TEST", label: "ธงส้มทดสอบ", title: "เตรียมอพยพ", headline: "เตรียมอพยพ", action: "เตรียมอพยพ", color: "orange", siren: false,
    });
  }
  const b = c.bridges.find((x) => x.stationCode === "X.90") ?? c.bridges[0]!;
  // ระหว่างเหลือง (3 ม.) กับแดง (2 ม.) ใต้ท้องสะพาน
  b.thresholds.ORANGE_TEST = { type: "belowSoffit", meters: 2.5 };
  return c;
};

describe.skipIf(!isLocalDevDb)("Integration: เกณฑ์ธงเตือนภัย (docs/44)", () => {
  let admin: AuthorizationContext;
  let officer: AuthorizationContext;

  beforeAll(async () => {
    await prisma.$connect();
    baselineVersion = (await prisma.flagCriteriaVersion.aggregate({ _max: { versionNo: true } }))._max.versionNo ?? 0;
    await cleanup();
    const mk = async (email: string, role: UserRoleEnum) => {
      const u = await prisma.user.create({ data: { email, name: `Fixture ${email}` } });
      await prisma.userRole.create({ data: { userId: u.id, role, isActive: true } });
      return loadContextOrThrow({ id: u.id, name: u.name, email: u.email });
    };
    [admin, officer] = await Promise.all([mk(EMAILS.admin, UserRoleEnum.ADMIN), mk(EMAILS.officer, UserRoleEnum.OFFICER)]);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("บทบาทอื่นแก้ไม่ได้และเปิดหน้าแก้ไม่ได้", async () => {
    const before = await getActiveFlagCriteria();
    const r = await saveFlagCriteria(officer, { baseVersionNo: before.versionNo, reason: "ลองแก้", config: withOrange(before.config) });
    expect(r).toEqual({ ok: false, reason: "FORBIDDEN" });
    expect(await getFlagCriteriaPageData(officer)).toBeNull();
    expect(await prisma.flagCriteriaVersion.count({ where: { versionNo: { gt: baselineVersion } } })).toBe(0);
  });

  it("ADMIN เพิ่มธงส้ม → เวอร์ชันใหม่ + Audit Log · หน้าแรกเห็นธงส้ม", async () => {
    const before = await getActiveFlagCriteria();
    const r = await saveFlagCriteria(admin, { baseVersionNo: before.versionNo, reason: "เพิ่มธงส้มเพื่อทดสอบ", config: withOrange(before.config) });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.versionNo).toBe(before.versionNo + 1);
    expect(r.changes).toContain("เพิ่มระดับ “ธงส้มทดสอบ” (สีส้ม)");

    const active = await getActiveFlagCriteria();
    expect(active.versionNo).toBe(r.versionNo);
    expect(active.config.levels.map((l) => l.key)).toContain("ORANGE_TEST");

    const audit = await prisma.auditLog.findFirst({ where: { userId: admin.userId, entityType: "FlagCriteriaVersion" }, orderBy: { createdAt: "desc" } });
    expect(audit?.reason).toBe("เพิ่มธงส้มเพื่อทดสอบ");
    expect(JSON.stringify(audit?.changes)).toContain("ธงส้มทดสอบ");
  });

  it("ฐานเวอร์ชันเก่า = CONFLICT · ไม่เปลี่ยน = NO_CHANGE", async () => {
    const active = await getActiveFlagCriteria();
    const stale = await saveFlagCriteria(admin, { baseVersionNo: active.versionNo - 1, reason: "ค่าค้าง", config: active.config });
    expect(stale).toEqual({ ok: false, reason: "CONFLICT" });
    const same = await saveFlagCriteria(admin, { baseVersionNo: active.versionNo, reason: "ไม่ได้แก้อะไร", config: active.config });
    expect(same).toEqual({ ok: false, reason: "NO_CHANGE" });
  });

  it("เกณฑ์ที่เรียงผิดถูกปฏิเสธที่ server", async () => {
    const active = await getActiveFlagCriteria();
    const bad = structuredClone(active.config);
    const b = bad.bridges.find((x) => x.stationCode === "X.90") ?? bad.bridges[0]!;
    b.thresholds.RED = { type: "belowSoffit", meters: 6 }; // ต่ำกว่าเหลือง
    const r = await saveFlagCriteria(admin, { baseVersionNo: active.versionNo, reason: "เกณฑ์ผิด", config: bad });
    expect(r).toMatchObject({ ok: false, reason: "INVALID" });
    expect((await getActiveFlagCriteria()).versionNo).toBe(active.versionNo);
  });

  it("ปรับระดับท้องสะพาน → ประวัติบอกค่าก่อน/หลัง", async () => {
    const active = await getActiveFlagCriteria();
    const next = structuredClone(active.config);
    const b = next.bridges.find((x) => x.stationCode === "X.90") ?? next.bridges[0]!;
    const old = b.soffitMsl;
    b.soffitMsl = (old ?? 10) + 0.07;
    const r = await saveFlagCriteria(admin, { baseVersionNo: active.versionNo, reason: "ได้ค่าท้องสะพานใหม่", config: next });
    expect(r.ok).toBe(true);
    const page = await getFlagCriteriaPageData(admin);
    expect(page?.history[0]?.changes.some((c) => c.includes("ระดับท้องสะพาน"))).toBe(true);
    // ไม่มีเวอร์ชันในฐานข้อมูลเลยตอนเริ่ม → ฉบับแรกเทียบกับค่าตั้งต้นในโค้ด
    if (baselineVersion === 0) expect(page?.history.at(-1)?.changes.length).toBeGreaterThan(0);
    expect(DEFAULT_FLAG_CRITERIA.levels.length).toBeGreaterThanOrEqual(2);
  });
});
