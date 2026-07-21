-- =============================================================================
-- SKL-FRIS Custom SQL — 10 PostGIS Columns
-- ต้องรัน "หลัง" Prisma สร้างตารางแล้ว (household, evacuation_site, community_boundary)
-- Idempotent (ADD COLUMN IF NOT EXISTS)
-- ⚠️ DRAFT — ยังไม่ Apply
-- =============================================================================

-- ครัวเรือน: geography(Point,4326) — Derived จาก lat/lng ผ่าน Trigger (ดู 20_)
ALTER TABLE "household"
  ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

-- จุดอพยพ
ALTER TABLE "evacuation_site"
  ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

-- ขอบเขตชุมชน (MultiPolygon — รองรับพื้นที่ไม่ต่อเนื่อง "สองคลอง")
ALTER TABLE "community_boundary"
  ADD COLUMN IF NOT EXISTS "geom" geography(MultiPolygon, 4326);
