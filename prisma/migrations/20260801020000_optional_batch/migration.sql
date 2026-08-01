-- Batch เป็นทางเลือก · PaperSheet เป็นเจ้าของชุมชนของตัวเอง (Owner Decision 2026-08-01 #R6-F)
--
-- ต้องรัน `scripts/audit-optional-batch.ts` ให้ผ่านก่อน — Backfill ขั้นที่ 2
-- จะถูกต้องก็ต่อเมื่อทุกใบหาปึกและชุมชนเจออย่างไม่กำกวม
--
-- ลำดับสำคัญ: เพิ่ม nullable → backfill → บังคับ NOT NULL → ค่อยผ่อนคอลัมน์อื่น
-- เพราะถ้าเพิ่ม NOT NULL ตั้งแต่แรกจะล้มทันทีบนตารางที่มีข้อมูลอยู่แล้ว

-- 1) เพิ่ม communityId แบบ nullable ชั่วคราว
ALTER TABLE "paper_sheet" ADD COLUMN "communityId" TEXT;

-- 2) Backfill จากปึก (ก่อนหน้านี้ปึกคือแหล่งเดียวที่รู้ชุมชนของใบ)
UPDATE "paper_sheet" s
SET "communityId" = b."communityId"
FROM "paper_batch" b
WHERE b."id" = s."batchId";

-- 3) Guard: ถ้ายังมีใบที่ backfill ไม่ได้ ให้ migration ล้มตรงนี้พร้อมข้อความที่อ่านรู้เรื่อง
--    (ปล่อยให้ ALTER ... SET NOT NULL ล้มเองจะได้ error ที่ไล่ต้นตอยาก)
DO $$
DECLARE missing INT;
BEGIN
  SELECT COUNT(*) INTO missing FROM "paper_sheet" WHERE "communityId" IS NULL;
  IF missing > 0 THEN
    RAISE EXCEPTION 'Backfill ไม่ครบ: มี paper_sheet % แถวที่หา communityId จากปึกไม่ได้', missing;
  END IF;
END $$;

-- 4) FK + Index (ทำก่อน SET NOT NULL เพื่อให้ค่าที่ backfill มาถูกตรวจว่าอ้างชุมชนจริง)
ALTER TABLE "paper_sheet" ADD CONSTRAINT "paper_sheet_communityId_fkey"
  FOREIGN KEY ("communityId") REFERENCES "community"("id")
  ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX "paper_sheet_communityId_status_idx" ON "paper_sheet"("communityId", "status");

-- 5) บังคับ NOT NULL — ทุกใบต้องรู้ชุมชนของตัวเองเสมอ (Authorization พึ่งค่านี้)
ALTER TABLE "paper_sheet" ALTER COLUMN "communityId" SET NOT NULL;

-- 6-7) ปึกและลำดับในปึกกลายเป็นทางเลือก
ALTER TABLE "paper_sheet" ALTER COLUMN "batchId" DROP NOT NULL;
ALTER TABLE "paper_sheet" ALTER COLUMN "sequence" DROP NOT NULL;

-- 8) คง FK เดิมเป็น ON DELETE RESTRICT (ไม่เปลี่ยนเป็น SET NULL)
--    เหตุผล: SET NULL จะเคลียร์ batchId แต่ไม่เคลียร์ sequence → ชน CHECK ข้อ 11 อยู่ดี
--    การถอดใบออกจากปึกต้องทำผ่าน Application ที่เคลียร์ทั้งคู่พร้อมกัน

-- 10) ลบคอลัมน์ Batch ที่ซ้ำกับ paper_sheet — อ่านผ่าน household.sheet.batchId แทน
--     (คอลัมน์นี้ไม่มี FK มาแต่ต้น มีเพียง index จึงลบได้โดยไม่กระทบ referential integrity)
DROP INDEX "household_batchId_idx";
ALTER TABLE "household" DROP COLUMN "batchId";

-- 11) กฎคู่ batchId/sequence — บังคับที่ฐานข้อมูล ไม่ใช่แค่ที่ Application
ALTER TABLE "paper_sheet" ADD CONSTRAINT "paper_sheet_batch_sequence_together"
  CHECK (("batchId" IS NULL) = ("sequence" IS NULL));

-- ลำดับในปึกต้องไม่ซ้ำ — ใบเดี่ยว (batchId IS NULL) ไม่อยู่ในขอบเขตของกฎนี้
CREATE UNIQUE INDEX "paper_sheet_batch_sequence_key"
  ON "paper_sheet"("batchId", "sequence") WHERE "batchId" IS NOT NULL;

-- index เดิมซ้ำซ้อนกับ unique ใหม่ (prefix เดียวกัน) — ลบทิ้งลดภาระเขียน
DROP INDEX "paper_sheet_batchId_sequence_idx";
