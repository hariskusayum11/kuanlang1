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

  // PII guard: Dev Seed ต้องไม่สร้าง Household เอง
  // หมายเหตุ: ทดสอบ "ที่มา" ไม่ใช่ "จำนวน" — เพราะการคีย์ผ่านหน้าจอในเครื่อง dev
  // สร้าง Household ได้ตามปกติ (ซึ่งไม่ใช่ข้อมูลจากซีด) ถ้ายืนยันแค่ count===0
  // เทสจะแดงทุกครั้งที่มีคนลองใช้ระบบ ทั้งที่ซีดยังสะอาดอยู่
  it("PII: ทุก Household ต้องมาจากการคีย์จริง — ซีดไม่สร้างข้อมูลบุคคล", async () => {
    // สคริปต์ที่ยัด Household ตรง ๆ จะไม่มี EntryAttempt ผูกกับใบ — ตรวจที่ร่องรอยนี้
    const notFromEntry = await prisma.household.count({
      where: { sheet: { entryAttempts: { none: {} } } },
    });
    expect(notFromEntry).toBe(0);
  });

  // จุดสำคัญเปิดใช้งานแล้ว: ข้อมูลที่มีอยู่ต้องพร้อมแสดงบนแผนที่อย่างปลอดภัย
  it("EvacuationSite: จุดสำคัญที่เปิดใช้งานมีชื่อและพิกัดถูกต้อง", async () => {
    const sites = await prisma.evacuationSite.findMany({
      where: { isActive: true },
      select: { name: true, latitude: true, longitude: true },
    });
    for (const site of sites) {
      expect(site.name.trim().length).toBeGreaterThan(0);
      expect(Number(site.latitude)).toBeGreaterThanOrEqual(-90);
      expect(Number(site.latitude)).toBeLessThanOrEqual(90);
      expect(Number(site.longitude)).toBeGreaterThanOrEqual(-180);
      expect(Number(site.longitude)).toBeLessThanOrEqual(180);
    }
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
        data: { communityId: tk.id, batchId: batch.id, sheetNo: "TEST-BR44-S1", sequence: 1 },
      });
      const s2 = await prisma.paperSheet.create({
        data: { communityId: tk.id, batchId: batch.id, sheetNo: "TEST-BR44-S2", sequence: 2 },
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

  // ข้อ3 (BR-CT-02/คำตัดสิน #8/Q-17): Community มีตำบลหลักได้ไม่เกิน 1
  // Partial unique: ux_community_primary_tambon ON community_tambon(communityId) WHERE isPrimary = true
  // (migration 20260721234500_add_community_primary_tambon_partial_unique)
  // Fixtures สังเคราะห์ล้วน (ชุมชน prefix TEST-PU-) — ตำบลใช้ของ Seed แบบ read-only เท่านั้น
  describe("ข้อ3 (BR-CT-02): Partial unique ux_community_primary_tambon", () => {
    let c1Id = "";
    let c2Id = "";
    let tambon1Id = "";
    let tambon2Id = "";

    async function cleanupFixtures() {
      await prisma.communityTambon.deleteMany({
        where: { community: { code: { startsWith: "TEST-PU-" } } },
      });
      await prisma.community.deleteMany({ where: { code: { startsWith: "TEST-PU-" } } });
    }

    beforeAll(async () => {
      await cleanupFixtures();
      // ใช้ตำบลจาก Seed แบบ read-only (ไม่สร้าง/แก้ geo hierarchy)
      const tambons = await prisma.tambon.findMany({ take: 2, orderBy: { code: "asc" } });
      if (tambons.length < 2) throw new Error("[PU test] ต้องมีตำบลจาก Seed อย่างน้อย 2 — รัน seed ก่อน");
      tambon1Id = tambons[0].id;
      tambon2Id = tambons[1].id;

      const c1 = await prisma.community.create({
        data: { code: "TEST-PU-C1", nameTh: "ชุมชนทดสอบ PU 1" },
      });
      const c2 = await prisma.community.create({
        data: { code: "TEST-PU-C2", nameTh: "ชุมชนทดสอบ PU 2" },
      });
      c1Id = c1.id;
      c2Id = c2.id;
    });

    afterAll(async () => {
      await cleanupFixtures();
    });

    it("ตำบลหลักแถวแรกของชุมชน → ผ่าน", async () => {
      const row = await prisma.communityTambon.create({
        data: { communityId: c1Id, tambonId: tambon1Id, isPrimary: true },
      });
      expect(row.isPrimary).toBe(true);
    });

    it("ตำบลหลักแถวที่ 2 ในชุมชนเดียวกัน → ถูกปฏิเสธ (unique violation)", async () => {
      await expect(
        prisma.communityTambon.create({
          data: { communityId: c1Id, tambonId: tambon2Id, isPrimary: true },
        }),
      ).rejects.toThrow(/Unique constraint|ux_community_primary_tambon/);
    });

    it("แถว isPrimary=false เพิ่มได้หลายแถว (นอก predicate ของ index)", async () => {
      await prisma.communityTambon.create({
        data: { communityId: c1Id, tambonId: tambon2Id, isPrimary: false },
      });
      await prisma.communityTambon.create({
        data: { communityId: c2Id, tambonId: tambon1Id, isPrimary: false },
      });
      await prisma.communityTambon.create({
        data: { communityId: c2Id, tambonId: tambon2Id, isPrimary: false },
      });
      const c1Rows = await prisma.communityTambon.count({ where: { communityId: c1Id } });
      const c2Rows = await prisma.communityTambon.count({ where: { communityId: c2Id } });
      expect(c1Rows).toBe(2); // t1 primary + t2 false
      expect(c2Rows).toBe(2); // t1 false + t2 false
    });

    it("ชุมชนไม่มีตำบลหลักเลย (0 primary) → อนุญาต", async () => {
      const c2Primary = await prisma.communityTambon.count({
        where: { communityId: c2Id, isPrimary: true },
      });
      expect(c2Primary).toBe(0);
    });

    it("คนละชุมชนต่างมีตำบลหลักของตัวเอง → ผ่าน (index จำกัดต่อ communityId)", async () => {
      // C1 มี primary อยู่แล้ว — C2 ตั้ง primary ของตัวเองได้ (UPDATE false → true ไม่ชน)
      const updated = await prisma.communityTambon.update({
        where: { communityId_tambonId: { communityId: c2Id, tambonId: tambon1Id } },
        data: { isPrimary: true },
      });
      expect(updated.isPrimary).toBe(true);
    });

    it("UPDATE false → true ในชุมชนที่มีตำบลหลักแล้ว → ถูกปฏิเสธ", async () => {
      await expect(
        prisma.communityTambon.update({
          where: { communityId_tambonId: { communityId: c2Id, tambonId: tambon2Id } },
          data: { isPrimary: true },
        }),
      ).rejects.toThrow(/Unique constraint|ux_community_primary_tambon/);
    });

    it("Seed ไม่ถูกกระทบ: KS01 ยังมี 2 ตำบล isPrimary=false ทั้งคู่", async () => {
      const ks = await prisma.community.findUnique({
        where: { code: "KS01" },
        include: { communityTambons: true },
      });
      expect(ks?.communityTambons.length).toBe(2);
      expect(ks?.communityTambons.every((t) => t.isPrimary === false)).toBe(true);
    });
  });
});
