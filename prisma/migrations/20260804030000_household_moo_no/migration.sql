-- หมู่ที่ เป็นตัวเลขดิบตามกระดาษ (Owner Decision 2026-08-04) — ผู้คีย์พิมพ์เลข ไม่เลือกจาก Master
--
-- เดิม entry เขียน Household.mooId (FK → moo) แต่ Master Moo เป็น seed สมมติ (Q-24)
-- และกระดาษให้เพียงตัวเลขหมู่ → เก็บดิบเป็น mooNo (paper-first เหมือน houseNo)
-- คง mooId ไว้เผื่อ map เข้า Master ภายหลัง — ไม่ทำลายข้อมูล/FK เดิม
ALTER TABLE "household" ADD COLUMN "mooNo" INTEGER;

-- CHECK: หมู่ที่ต้องไม่ติดลบ (สอดคล้องกับ answerCount ฝั่ง App)
ALTER TABLE "household" ADD CONSTRAINT "household_moo_no_nonneg"
  CHECK ("mooNo" IS NULL OR "mooNo" >= 0);
