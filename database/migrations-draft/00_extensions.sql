-- =============================================================================
-- SKL-FRIS Custom SQL — 00 Extensions
-- รันได้ก่อน/อิสระจากตาราง Prisma (Idempotent)
-- ⚠️ DRAFT — ยังไม่ Apply กับ Production
-- หมายเหตุ: Prisma datasource มี extensions=[postgis] → Prisma อาจสร้าง postgis ให้เอง
--   ไฟล์นี้เป็น fallback + เพิ่ม pg_trgm (Prisma ยังไม่ประกาศ pg_trgm ใน datasource)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
