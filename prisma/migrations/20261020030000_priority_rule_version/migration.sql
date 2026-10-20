-- กฎการจัดลำดับแบบมีเวอร์ชัน (docs/40-priority-rules.md) — ตารางใหม่ ไม่แตะข้อมูลเดิม
-- ย้อนกลับ: DROP TABLE "priority_rule_version";
-- Append-only: แอปไม่มีคำสั่ง UPDATE/DELETE ตารางนี้ · แก้กฎ = เพิ่มแถว versionNo ถัดไป

-- CreateTable
CREATE TABLE "priority_rule_version" (
    "id" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "riskConfig" JSONB NOT NULL,
    "triageMap" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "priority_rule_version_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "priority_rule_version_versionNo_key" ON "priority_rule_version"("versionNo");

-- AddForeignKey
ALTER TABLE "priority_rule_version" ADD CONSTRAINT "priority_rule_version_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ข้อบังคับระดับฐานข้อมูล: เลขเวอร์ชันเป็นบวก · ต้องมีเหตุผล · JSON เป็น object
ALTER TABLE "priority_rule_version" ADD CONSTRAINT "ck_priority_rule_version_no" CHECK ("versionNo" > 0);
ALTER TABLE "priority_rule_version" ADD CONSTRAINT "ck_priority_rule_reason" CHECK (length(btrim("reason")) > 0);
ALTER TABLE "priority_rule_version" ADD CONSTRAINT "ck_priority_rule_json" CHECK (jsonb_typeof("riskConfig") = 'object' AND jsonb_typeof("triageMap") = 'object');
