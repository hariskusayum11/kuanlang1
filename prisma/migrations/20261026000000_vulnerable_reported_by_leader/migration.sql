-- หัวหน้าชุมชน/แอดมินแจ้งเพิ่มคนเปราะบางหลังการสำรวจ (docs/43-community-admin.md)
-- เพิ่มอย่างเดียว ไม่แก้/ไม่ลบข้อมูลเดิม — แถวเดิมทั้งหมดเป็น "จากกระดาษ" (reportedAt = NULL)
--
-- ย้อนกลับ: DROP CONSTRAINT ทั้งสอง + DROP INDEX + DROP COLUMN ได้ตรง ๆ
--   (ถ้ามีแถวที่แจ้งเพิ่มแล้ว ให้ตัดสินก่อนว่าจะเก็บอย่างไร — DROP COLUMN จะทำให้แยกไม่ออกว่าแถวไหนไม่ได้มาจากกระดาษ)
--
-- หมายเหตุ: prisma migrate diff สร้าง DROP DEFAULT ของ flood_risk_profile."nearestEvacSiteTypes"
-- มาด้วยเพราะ drift ที่มีอยู่ก่อน — ตัดออกโดยตั้งใจ ไม่ใช่ขอบเขตของงานนี้

-- AlterTable
ALTER TABLE "vulnerable_person" ADD COLUMN     "reportedAt" TIMESTAMP(3),
ADD COLUMN     "reportedById" TEXT;

-- CreateIndex
CREATE INDEX "vulnerable_person_reportedAt_idx" ON "vulnerable_person"("reportedAt");

-- AddForeignKey
ALTER TABLE "vulnerable_person" ADD CONSTRAINT "vulnerable_person_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- แถวที่แจ้งเพิ่มใช้ลำดับ 1001 ขึ้นไปเสมอ แถวกระดาษใช้ต่ำกว่า 1001 — กันชน @@unique([householdId, seq])
-- เมื่อแก้ใบกระดาษแล้วสร้างแถวกระดาษใหม่ (แถวแจ้งเพิ่มไม่ถูกลบ)
ALTER TABLE "vulnerable_person" ADD CONSTRAINT "ck_vulnerable_reported_seq"
  CHECK (("reportedAt" IS NULL) = ("seq" < 1001));

-- มีผู้แจ้ง → ต้องมีวันที่แจ้ง (ผู้แจ้งอาจกลายเป็น NULL ได้เมื่อบัญชีถูกลบ แต่วันที่ยังอยู่)
ALTER TABLE "vulnerable_person" ADD CONSTRAINT "ck_vulnerable_reported_by_has_date"
  CHECK ("reportedById" IS NULL OR "reportedAt" IS NOT NULL);
