-- เกณฑ์ธงเตือนภัยชุมชนแบบมีเวอร์ชัน (docs/44-homepage-flag-criteria.md) — ตารางใหม่ ไม่แตะข้อมูลเดิม
-- ย้อนกลับ: DROP TABLE "flag_criteria_version";
-- Append-only: แอปไม่มีคำสั่ง UPDATE/DELETE ตารางนี้ · แก้เกณฑ์ = เพิ่มแถว versionNo ถัดไป

-- CreateTable
CREATE TABLE "flag_criteria_version" (
    "id" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flag_criteria_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "flag_criteria_version_versionNo_key" ON "flag_criteria_version"("versionNo");

-- AddForeignKey
ALTER TABLE "flag_criteria_version" ADD CONSTRAINT "flag_criteria_version_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ข้อบังคับระดับฐานข้อมูล: เลขเวอร์ชันเป็นบวก · ต้องมีเหตุผล · JSON เป็น object
ALTER TABLE "flag_criteria_version" ADD CONSTRAINT "ck_flag_criteria_version_no" CHECK ("versionNo" > 0);
ALTER TABLE "flag_criteria_version" ADD CONSTRAINT "ck_flag_criteria_reason" CHECK (length(btrim("reason")) > 0);
ALTER TABLE "flag_criteria_version" ADD CONSTRAINT "ck_flag_criteria_json" CHECK (jsonb_typeof("config") = 'object');
