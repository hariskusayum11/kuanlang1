-- บทบาทหัวหน้าชุมชน + ผู้บันทึกสถานะกลุ่มเปราะบาง (docs/34-community-leader-status.md)
-- เพิ่มอย่างเดียว ไม่แก้/ไม่ลบข้อมูลเดิม
--
-- ย้อนกลับ: DROP CONSTRAINT + DROP COLUMN ได้ตรง ๆ ส่วนค่า enum ลบออกจาก PostgreSQL
-- ไม่ได้โดยตรง — ถ้าจำเป็นต้องถอด ให้ปิด UserRole ที่เป็น COMMUNITY_LEADER แทน (ไม่มีผลข้างเคียง)
--
-- หมายเหตุ: prisma migrate สร้างคำสั่ง DROP DEFAULT ของ flood_risk_profile."nearestEvacSiteTypes"
-- มาด้วยเพราะ drift ที่มีอยู่ก่อน — ตัดออกโดยตั้งใจ ไม่ใช่ขอบเขตของงานนี้

-- AlterEnum
ALTER TYPE "UserRoleEnum" ADD VALUE 'COMMUNITY_LEADER';

-- AlterTable
ALTER TABLE "vulnerable_person" ADD COLUMN     "deactivatedById" TEXT;

-- AddForeignKey
ALTER TABLE "vulnerable_person" ADD CONSTRAINT "vulnerable_person_deactivatedById_fkey" FOREIGN KEY ("deactivatedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
