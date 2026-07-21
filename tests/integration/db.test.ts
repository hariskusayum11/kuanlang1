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

  // ข้อ8 (BR-44/FR-VER-03/SCH-03): คนเดียวกันคีย์ Entry 1+2 ต้องถูกปฏิเสธ
  // Trigger: check_different_entry_person (migration 20260721231914_br44_check_different_entry_person)
  // Fixtures สังเคราะห์ล้วน (prefix TEST-BR44-) — สร้างใน beforeAll และลบทิ้งใน afterAll (idempotent)
  describe("ข้อ8 (BR-44): Trigger check_different_entry_person", () => {
    const EMAIL_A = "br44-test-a@test.invalid";
    const EMAIL_B = "br44-test-b@test.invalid";
    let userAId = "";
    let userBId = "";
    let sheet1Id = "";
    let sheet2Id = "";

    async function cleanupFixtures() {
      await prisma.entryAttempt.deleteMany({
        where: { sheet: { sheetNo: { startsWith: "TEST-BR44-" } } },
      });
      await prisma.paperSheet.deleteMany({ where: { sheetNo: { startsWith: "TEST-BR44-" } } });
      await prisma.paperBatch.deleteMany({ where: { code: { startsWith: "TEST-BR44-" } } });
      await prisma.user.deleteMany({ where: { email: { in: [EMAIL_A, EMAIL_B] } } });
    }

    beforeAll(async () => {
      await cleanupFixtures();
      const tk = await prisma.community.findUnique({ where: { code: "TK01" } });
      if (!tk) throw new Error("[BR-44 test] ไม่พบชุมชน TK01 — ต้องรัน seed ก่อน");

      const userA = await prisma.user.create({
        data: { email: EMAIL_A, name: "BR44 Test User A" },
      });
      const userB = await prisma.user.create({
        data: { email: EMAIL_B, name: "BR44 Test User B" },
      });
      userAId = userA.id;
      userBId = userB.id;

      const batch = await prisma.paperBatch.create({
        data: {
          code: "TEST-BR44-BATCH",
          communityId: tk.id,
          expectedCount: 2,
          receivedAt: new Date(),
          receivedById: userA.id,
        },
      });
      const s1 = await prisma.paperSheet.create({
        data: { batchId: batch.id, sheetNo: "TEST-BR44-S1", sequence: 1 },
      });
      const s2 = await prisma.paperSheet.create({
        data: { batchId: batch.id, sheetNo: "TEST-BR44-S2", sequence: 2 },
      });
      sheet1Id = s1.id;
      sheet2Id = s2.id;
    });

    afterAll(async () => {
      await cleanupFixtures();
    });

    it("คนละคนคีย์ Entry 1 และ 2 ของใบเดียวกัน → ผ่าน", async () => {
      await prisma.entryAttempt.create({
        data: {
          sheetId: sheet1Id,
          attemptNo: 1,
          enteredById: userAId,
          startedAt: new Date(),
          payload: {},
        },
      });
      const e2 = await prisma.entryAttempt.create({
        data: {
          sheetId: sheet1Id,
          attemptNo: 2,
          enteredById: userBId,
          startedAt: new Date(),
          payload: {},
          isBlind: true,
        },
      });
      expect(e2.id).toBeTruthy();
    });

    it("คนเดียวกันคีย์ Entry 1+2 ของใบเดียวกัน → ถูกปฏิเสธด้วย BR-44", async () => {
      await prisma.entryAttempt.create({
        data: {
          sheetId: sheet2Id,
          attemptNo: 1,
          enteredById: userAId,
          startedAt: new Date(),
          payload: {},
        },
      });
      await expect(
        prisma.entryAttempt.create({
          data: {
            sheetId: sheet2Id,
            attemptNo: 2,
            enteredById: userAId,
            startedAt: new Date(),
            payload: {},
            isBlind: true,
          },
        }),
      ).rejects.toThrow(/BR-44/);
    });

    it("bypass ด้วย UPDATE enteredById เป็นคนเดิม → ถูกปฏิเสธด้วย BR-44", async () => {
      const e2 = await prisma.entryAttempt.findUnique({
        where: { sheetId_attemptNo: { sheetId: sheet1Id, attemptNo: 2 } },
      });
      expect(e2).not.toBeNull();
      await expect(
        prisma.entryAttempt.update({
          where: { id: e2!.id },
          data: { enteredById: userAId },
        }),
      ).rejects.toThrow(/BR-44/);
    });

    it("คนเดียวกันคีย์คนละใบ → ผ่าน (trigger ไม่บล็อกข้าม sheet)", async () => {
      // userA มี attempt 1 ทั้ง S1 และ S2 สำเร็จแล้ว = ไม่บล็อกข้ามใบ
      const count = await prisma.entryAttempt.count({ where: { enteredById: userAId } });
      expect(count).toBe(2);
    });
  });

  // ข้อ3: Community มีตำบลหลักได้ไม่เกิน 1 (partial unique ux_community_primary_tambon)
  //   → ต้องรอ Custom SQL 0004 (constraints) ซึ่งยังไม่ได้ formalize/apply
  it.todo("ข้อ3: ตำบลหลัก >1 ต่อชุมชน ถูกปฏิเสธ (รอ partial unique — custom SQL 0004)");
});
