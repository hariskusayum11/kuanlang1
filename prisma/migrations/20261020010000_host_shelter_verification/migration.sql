-- ยืนยันบ้านพักพิงจากแบบสอบถาม (docs/38-host-shelter-verification.md) — เพิ่มอย่างเดียว
-- จุดอพยพเดิมทั้งหมดได้ isPublic = true (พฤติกรรมเดิม: แสดงบนหน้าสาธารณะ)
-- ย้อนกลับ: DROP CONSTRAINT ทั้ง 3 + DROP INDEX + DROP COLUMN ทั้ง 4

-- AlterTable
ALTER TABLE "evacuation_site" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sourceHouseholdId" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "evacuation_site_sourceHouseholdId_key" ON "evacuation_site"("sourceHouseholdId");

-- AddForeignKey
ALTER TABLE "evacuation_site" ADD CONSTRAINT "evacuation_site_sourceHouseholdId_fkey" FOREIGN KEY ("sourceHouseholdId") REFERENCES "household"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evacuation_site" ADD CONSTRAINT "evacuation_site_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- บ้านพักพิงจากครัวเรือนต้องเป็นประเภท "บ้านพักพิง" และต้องมีผู้ยืนยัน
ALTER TABLE "evacuation_site" ADD CONSTRAINT "ck_evacuation_site_host_shelter"
  CHECK ("sourceHouseholdId" IS NULL OR ("type" = 'RELATIVE_HOME' AND "verifiedAt" IS NOT NULL));
