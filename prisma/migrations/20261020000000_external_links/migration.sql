-- ลิงก์ระบบภายนอกบนหน้าสาธารณะ (docs/37-external-links.md) — ตารางใหม่ ไม่แตะข้อมูลเดิม
-- ย้อนกลับ: DROP TABLE "external_link";

-- CreateTable
CREATE TABLE "external_link" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_link_code_key" ON "external_link"("code");

-- CreateIndex
CREATE INDEX "external_link_isActive_sortOrder_idx" ON "external_link"("isActive", "sortOrder");

-- ป้องกันชั้นฐานข้อมูล: ลิงก์ที่แสดงบนหน้าสาธารณะต้องเป็น https เท่านั้น (กัน javascript:/http: แม้ข้ามชั้นแอป)
ALTER TABLE "external_link" ADD CONSTRAINT "ck_external_link_https" CHECK ("url" ~* '^https://[^\s]+$');
-- หมวดต้องเป็นค่าที่รู้จัก (ตรงกับ EXTERNAL_LINK_CATEGORIES)
ALTER TABLE "external_link" ADD CONSTRAINT "ck_external_link_category" CHECK ("category" IN ('RAIN', 'WATER', 'SATELLITE', 'RESPONSE', 'OTHER'));
