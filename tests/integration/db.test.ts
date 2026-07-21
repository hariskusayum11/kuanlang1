import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

// Integration tests — ต้องมี Dev DB (PostgreSQL + PostGIS)
// -----------------------------------------------------------------------------
// การเลือกว่าจะรันหรือ skip ต้อง "รู้ค่าตั้งแต่ตอนประกาศ Suite" (collection time)
// เพราะ describe.skipIf / it.skipIf ประเมินเงื่อนไขตอน register ก่อน beforeAll
//   → ห้ามใช้ตัวแปรที่เพิ่งถูกตั้งค่าใน beforeAll เป็นเงื่อนไข skip (บั๊กเดิม)
// เงื่อนไข: มี DATABASE_URL และชี้ local dev เท่านั้น (localhost/127.0.0.1)
//   - ไม่มี DATABASE_URL → skip ทั้ง suite อย่างชัดเจน (รู้ตั้งแต่ประกาศ)
//   - มี DATABASE_URL local แต่ connect ไม่ได้ → beforeAll throw → suite FAIL (ไม่ skip เงียบ)
//   - DATABASE_URL ชี้ host อื่น (เช่น Production) → skip เพื่อความปลอดภัย (ห้ามรันกับ Production)
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();

describe.skipIf(!isLocalDevDb)("Integration (local Dev DB — PostgreSQL/PostGIS)", () => {
  beforeAll(async () => {
    // มี DATABASE_URL local แต่ต่อไม่ได้ → ต้อง FAIL พร้อมข้อความชัดเจน (ไม่ skip เงียบ)
    try {
      await prisma.$connect();
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      throw new Error(
        `[integration] เชื่อมต่อ Development DB ไม่ได้ (DATABASE_URL local) — ` +
          `ตรวจว่า docker compose up -d db แล้ว migration ถูก apply: ${String(e)}`,
      );
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ข้อ9: Seed idempotent — ชุมชน Dev Seed ครบ 5 + ไม่มีชุมชนตัวอย่างเดิม
  it("ข้อ9: Seed idempotent — 5 ชุมชนครบ, ไม่มี KL01/HY01", async () => {
    const count = await prisma.community.count({
      where: { code: { in: ["TK01", "PM01", "KS01", "PW01", "NK01"] } },
    });
    expect(count).toBe(5);
    const legacy = await prisma.community.count({ where: { code: { in: ["KL01", "HY01"] } } });
    expect(legacy).toBe(0);
  });

  // ข้อ10: ควนสันติ (KS01) เชื่อม 2 ตำบล, isPrimary=false ทั้งคู่
  it("ข้อ10: KS01 เชื่อม 2 ตำบล และ isPrimary=false ทั้งคู่", async () => {
    const ks = await prisma.community.findUnique({
      where: { code: "KS01" },
      include: { communityTambons: true },
    });
    expect(ks).not.toBeNull();
    expect(ks?.communityTambons.length).toBe(2);
    expect(ks?.communityTambons.every((t) => t.isPrimary === false)).toBe(true);
  });

  // PII guard: Phase 1 Dev Seed ต้องไม่มีข้อมูลบุคคลจริง (ไม่ seed household)
  it("PII: ไม่มี Household (ไม่มีข้อมูลบุคคลจริงใน Dev Seed)", async () => {
    const households = await prisma.household.count();
    expect(households).toBe(0);
  });

  // Phase 2 guard: EvacuationSite ยังไม่เปิดใช้งานใน Phase 1 (ไม่มี Seed)
  it("Phase 2: ไม่มี EvacuationSite Seed ใน Phase 1", async () => {
    const sites = await prisma.evacuationSite.count();
    expect(sites).toBe(0);
  });

  // ข้อ8 (BR-44): คนเดียวกันคีย์ Entry 1+2 ต้องถูกปฏิเสธ (Trigger check_different_entry_person)
  //   → ต้องรอ Custom SQL 0003 (functions/triggers) ซึ่งยังไม่ได้ formalize/apply
  it.todo("ข้อ8: คนเดียวกันคีย์ Entry 1+2 ถูกปฏิเสธ (รอ trigger BR-44 — custom SQL 0003)");

  // ข้อ3: Community มีตำบลหลักได้ไม่เกิน 1 (partial unique ux_community_primary_tambon)
  //   → ต้องรอ Custom SQL 0004 (constraints) ซึ่งยังไม่ได้ formalize/apply
  it.todo("ข้อ3: ตำบลหลัก >1 ต่อชุมชน ถูกปฏิเสธ (รอ partial unique — custom SQL 0004)");
});
