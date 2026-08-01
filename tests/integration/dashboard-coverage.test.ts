import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BatchStatus, PrismaClient, SheetStatus, UserRoleEnum } from "@prisma/client";
import { fetchCommunityCoverage } from "../../lib/dashboard/get-coverage";

// Integration — Dashboard Coverage: Survey/Verified Coverage รายชุมชน + scope
// รันเฉพาะ local dev DB — fixtures สังเคราะห์ (TCOV-*) ลบใน afterAll
const dbUrl = process.env.DATABASE_URL ?? "";
const isLocalDevDb = /@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl);

const prisma = new PrismaClient();
const C1 = "TCOV1";
const C2 = "TCOV2";
const BATCH1 = "BATCH-TCOV-1";
const BATCH2 = "BATCH-TCOV-2";
const KEYER = "test-cov-keyer@test.invalid";

async function cleanup() {
  const communities = await prisma.community.findMany({
    where: { code: { in: [C1, C2] } },
    select: { id: true },
  });
  const cids = communities.map((c) => c.id);
  if (cids.length > 0) {
    const hh = await prisma.household.findMany({
      where: { communityId: { in: cids } },
      select: { id: true },
    });
    await prisma.household.deleteMany({ where: { id: { in: hh.map((h) => h.id) } } });
  }
  const batches = await prisma.paperBatch.findMany({
    where: { code: { in: [BATCH1, BATCH2] } },
    select: { id: true },
  });
  if (batches.length > 0) {
    await prisma.paperSheet.deleteMany({ where: { batchId: { in: batches.map((b) => b.id) } } });
    await prisma.paperBatch.deleteMany({ where: { id: { in: batches.map((b) => b.id) } } });
  }
  await prisma.user.deleteMany({ where: { email: KEYER } });
  await prisma.community.deleteMany({ where: { code: { in: [C1, C2] } } });
}

describe.skipIf(!isLocalDevDb)("Integration: Dashboard Coverage", () => {
  let c1Id = "";
  let c2Id = "";

  beforeAll(async () => {
    await prisma.$connect();
    await cleanup();

    const c1 = await prisma.community.create({
      data: { code: C1, nameTh: "ชุมชนคัฟเวอเรจ 1", totalHouseholds: 100, targetCoveragePercent: 60 },
    });
    const c2 = await prisma.community.create({
      data: { code: C2, nameTh: "ชุมชนคัฟเวอเรจ 2", totalHouseholds: null },
    });
    c1Id = c1.id;
    c2Id = c2.id;

    const keyer = await prisma.user.create({ data: { email: KEYER, name: "Cov Keyer" } });
    await prisma.userRole.create({
      data: { userId: keyer.id, role: UserRoleEnum.DATA_ENTRY, isActive: true },
    });

    const mkBatch = (code: string, communityId: string) =>
      prisma.paperBatch.create({
        data: {
          code,
          communityId,
          expectedCount: 5,
          receivedAt: new Date(),
          receivedById: keyer.id,
          status: BatchStatus.IN_PROGRESS,
        },
      });
    const batch1 = await mkBatch(BATCH1, c1.id);
    const batch2 = await mkBatch(BATCH2, c2.id);

    let seq = 0;
    const mkHousehold = async (
      communityId: string,
      batchId: string,
      sheetStatus: SheetStatus,
      opts: { duplicate?: boolean; deleted?: boolean } = {},
    ) => {
      seq += 1;
      const sheet = await prisma.paperSheet.create({
        data: {
          communityId,
          batchId,
          sheetNo: `TCOV-SHEET-${seq}`,
          sequence: seq,
          status: sheetStatus,
        },
      });
      await prisma.household.create({
        data: {
          sheetId: sheet.id,
          communityId,
          enteredById: keyer.id,
          hasDuplicateFlag: opts.duplicate ?? false,
          deletedAt: opts.deleted ? new Date() : null,
        },
      });
    };

    // C1: 2 คีย์แล้ว (1 VERIFIED) + 1 ซ้ำ(ตัดออก) + 1 soft-deleted(ตัดออก)
    await mkHousehold(c1.id, batch1.id, SheetStatus.VERIFIED); // นับ surveyed + verified
    await mkHousehold(c1.id, batch1.id, SheetStatus.ENTERED_1); // นับ surveyed
    await mkHousehold(c1.id, batch1.id, SheetStatus.VERIFIED, { duplicate: true }); // ตัดออก
    await mkHousehold(c1.id, batch1.id, SheetStatus.VERIFIED, { deleted: true }); // ตัดออก
    // C2: 1 คีย์แล้ว (ยังไม่ verified) — total NULL
    await mkHousehold(c2.id, batch2.id, SheetStatus.ENTERED_1);
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  it("global scope: นับ surveyed/verified ถูก · ไม่นับซ้ำ/soft-deleted · total NULL = NOT_CALCULABLE", async () => {
    const { rows } = await fetchCommunityCoverage({ isGlobalScope: true, communityIds: [] });
    const r1 = rows.find((r) => r.communityId === c1Id);
    const r2 = rows.find((r) => r.communityId === c2Id);

    expect(r1?.surveyed).toBe(2); // VERIFIED + ENTERED_1 (ไม่รวมซ้ำ/ลบ)
    expect(r1?.verified).toBe(1); // เฉพาะ VERIFIED ที่ไม่ซ้ำ/ไม่ลบ
    expect(r1?.verifiedCoverage).toEqual({ kind: "CALCULATED", percent: 1, meetsTarget: false });

    expect(r2?.surveyed).toBe(1);
    expect(r2?.verified).toBe(0);
    expect(r2?.verifiedCoverage.kind).toBe("NOT_CALCULABLE"); // total NULL
  });

  it("scoped: เห็นเฉพาะชุมชนใน scope · scope ว่าง → ไม่เห็นเลย", async () => {
    const only1 = await fetchCommunityCoverage({ isGlobalScope: false, communityIds: [c1Id] });
    expect(only1.rows.map((r) => r.communityId)).toEqual([c1Id]);
    expect(only1.summary.verified).toBe(1);
    expect(only1.summary.totalHouseholdsKnown).toBe(100);

    const empty = await fetchCommunityCoverage({ isGlobalScope: false, communityIds: [] });
    expect(empty.rows).toEqual([]);
    expect(empty.summary.verifiedCoverage.kind).toBe("NOT_CALCULABLE");
  });
});
