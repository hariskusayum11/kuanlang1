/**
 * ตรวจความพร้อมก่อน Migration "Batch เป็นทางเลือก" (Owner Decision 2026-08-01 #R6-F)
 *
 * ต้องผ่านทุกข้อก่อน Apply Migration — ถ้าไม่ผ่านให้ **หยุด** และซ่อมข้อมูลก่อน
 * เพราะ Backfill `PaperSheet.communityId` จาก `PaperBatch.communityId`
 * จะถูกต้องก็ต่อเมื่อทุกใบหาปึกและชุมชนเจอ และข้อมูลเดิมไม่ขัดกันเอง
 *
 * รัน: node --env-file=.env --import tsx scripts/audit-optional-batch.ts
 * คืน exit code 1 เมื่อพบปัญหา · **ห้ามพิมพ์ PII** — รายงานเป็นจำนวนเท่านั้น
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function countOf(rows: { n: bigint }[]): Promise<number> {
  return Number(rows[0].n);
}

async function main() {
  // ใบที่ batchId ชี้ไปยังปึกที่ไม่มีอยู่จริง (ไม่ควรเกิด — มี FK แต่ตรวจไว้กันข้อมูลนำเข้า)
  const orphanSheets = await countOf(
    await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "paper_sheet" s
      LEFT JOIN "paper_batch" b ON b."id" = s."batchId"
      WHERE b."id" IS NULL`,
  );

  // ใบที่หา Community จากปึกไม่ได้ → Backfill จะได้ NULL
  const sheetsWithoutCommunity = await countOf(
    await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "paper_sheet" s
      JOIN "paper_batch" b ON b."id" = s."batchId"
      LEFT JOIN "community" c ON c."id" = b."communityId"
      WHERE c."id" IS NULL`,
  );

  // Household อยู่คนละชุมชนกับปึกของใบตัวเอง → ต้องตัดสินก่อนว่าจะเชื่อฝั่งไหน
  const communityMismatch = await countOf(
    await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "household" h
      JOIN "paper_sheet" s ON s."id" = h."sheetId"
      JOIN "paper_batch" b ON b."id" = s."batchId"
      WHERE h."communityId" <> b."communityId"`,
  );

  // คอลัมน์ซ้ำที่กำลังจะลบ ต้องตรงกับต้นทางก่อน ไม่งั้นแปลว่าเคยมีของหลุด
  const batchMismatch = await countOf(
    await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM "household" h
      JOIN "paper_sheet" s ON s."id" = h."sheetId"
      WHERE h."batchId" <> s."batchId"`,
  );

  // (batchId, sequence) ซ้ำ → Partial Unique Index จะสร้างไม่ผ่าน
  const duplicateSequence = await countOf(
    await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*)::bigint AS n FROM (
        SELECT "batchId", "sequence" FROM "paper_sheet"
        GROUP BY 1, 2 HAVING COUNT(*) > 1
      ) t`,
  );

  const [batches, sheets, households] = await Promise.all([
    prisma.paperBatch.count(),
    prisma.paperSheet.count(),
    prisma.household.count(),
  ]);

  const problems = {
    orphanSheets,
    sheetsWithoutCommunity,
    communityMismatch,
    batchMismatch,
    duplicateSequence,
  };
  const ok = Object.values(problems).every((n) => n === 0);

  console.log(
    JSON.stringify({ totals: { batches, sheets, households }, problems, ok }, null, 2),
  );

  if (!ok) {
    console.error(
      "\n! ไม่ผ่านเงื่อนไข — ห้าม Apply Migration จนกว่าจะซ่อมข้อมูลข้างต้นให้เป็น 0 ทุกข้อ",
    );
    process.exitCode = 1;
    return;
  }
  console.log("\n✓ ข้อมูลพร้อม Backfill — communityId ของทุกใบหาได้จากปึกอย่างไม่กำกวม");
}

void main().finally(() => prisma.$disconnect());
