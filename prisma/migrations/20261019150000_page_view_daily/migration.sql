-- ยอดเปิดหน้าเว็บรายวันแบบรวม (docs/36-usage-dashboard.md · Owner Decision 2026-10-19)
-- เพิ่มอย่างเดียว ไม่แตะตาราง/ข้อมูลเดิม
-- ตั้งใจไม่มีคอลัมน์ IP / User Agent / userId — ห้ามเพิ่มภายหลังโดยไม่มีคำตัดสินใหม่
--
-- ย้อนกลับ: DROP TABLE "page_view_daily"; DROP TYPE "PageViewAudience";

-- CreateEnum
CREATE TYPE "PageViewAudience" AS ENUM ('PUBLIC', 'SIGNED_IN');

-- CreateTable
CREATE TABLE "page_view_daily" (
    "day" DATE NOT NULL,
    "path" VARCHAR(80) NOT NULL,
    "audience" "PageViewAudience" NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "page_view_daily_pkey" PRIMARY KEY ("day","path","audience")
);

-- ยอดติดลบไม่มีความหมาย และ path ต้องเป็นรูปแบบเส้นทาง (ขึ้นต้นด้วย / ไม่มี query/fragment)
ALTER TABLE "page_view_daily" ADD CONSTRAINT "page_view_daily_count_nonnegative" CHECK ("count" >= 0);
ALTER TABLE "page_view_daily" ADD CONSTRAINT "page_view_daily_path_pattern" CHECK ("path" ~ '^/[A-Za-z0-9/_\[\]-]*$');
