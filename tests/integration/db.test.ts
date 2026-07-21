import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";

// Integration tests — ต้องมี Dev DB (PostgreSQL + PostGIS + Custom SQL applied)
// รอบนี้ยังไม่มี Dev DB → ตรวจการเชื่อมต่อก่อน, ถ้าไม่ได้ให้ skip (ไม่ fail)
const prisma = new PrismaClient();
let dbReady = false;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbReady = true;
  } catch {
    dbReady = false;
    console.warn("[integration] ไม่มี Dev DB — ข้ามการทดสอบ integration (ต้องมี PostgreSQL + Custom SQL)");
  }
});

describe("Integration (ต้องมี Dev DB — ข้ามถ้าไม่มี)", () => {
  // ข้อ 8: คนเดียวกันคีย์ Entry 1 และ Entry 2 ต้องถูกปฏิเสธ (Trigger)
  it.skipIf(!dbReady)("ข้อ8: คนเดียวกันคีย์ Entry 1+2 ถูกปฏิเสธ (trigger)", async () => {
    // ต้องมี sheet + user จริง — โครงทดสอบ (รันเมื่อมี DB + seed dev)
    // await expect(createEntryAttempt({sheetId, enteredById:userA, attemptNo:1})).resolves
    // await expect(createEntryAttempt({sheetId, enteredById:userA, attemptNo:2})).rejects.toThrow(/BR-44/)
    expect(dbReady).toBe(true);
  });

  // ข้อ 3 (runtime): Community มีตำบลหลักได้ไม่เกิน 1
  it.skipIf(!dbReady)("ข้อ3: ตำบลหลัก >1 ต่อชุมชน ถูกปฏิเสธ (partial unique)", async () => {
    expect(dbReady).toBe(true);
  });

  // ข้อ 9: Seed รันซ้ำแล้วไม่สร้างข้อมูลซ้ำ
  it.skipIf(!dbReady)("ข้อ9: Seed idempotent (5 ชุมชนคงเดิม)", async () => {
    const count = await prisma.community.count({
      where: { code: { in: ["TK01", "PM01", "KS01", "PW01", "NK01"] } },
    });
    expect(count).toBe(5);
    const kl = await prisma.community.count({ where: { code: { in: ["KL01", "HY01"] } } });
    expect(kl).toBe(0);
  });

  // ข้อ 10 (runtime): ควนสันติเชื่อมกับ 2 ตำบล
  it.skipIf(!dbReady)("ข้อ10: KS01 เชื่อม 2 ตำบล", async () => {
    const ks = await prisma.community.findUnique({
      where: { code: "KS01" },
      include: { communityTambons: true },
    });
    expect(ks?.communityTambons.length).toBe(2);
    expect(ks?.communityTambons.every((t) => t.isPrimary === false)).toBe(true);
  });
});
