-- =============================================================================
-- SKL-FRIS Custom SQL — 10 PostGIS Columns
-- ต้องรัน "หลัง" Prisma สร้างตารางแล้ว (household, evacuation_site, community_boundary)
-- Idempotent (ADD COLUMN IF NOT EXISTS)
-- ⚠️ DRAFT — ยังไม่ Apply
-- 📌 อัปเดต (Conflict A แก้แล้ว): schema.prisma ประกาศคอลัมน์เหล่านี้ด้วย
--    Unsupported("geography(...)") แล้ว → Prisma จะจัดการใน Migration init เอง
--    (Household.location, EvacuationSite.location, CommunityBoundary.geom)
--    ไฟล์นี้จึง "ซ้ำซ้อน/fallback" — คง ADD COLUMN IF NOT EXISTS ไว้ให้ Idempotent
--    ห้ามให้เกิดการสร้างคอลัมน์ซ้ำที่ error (IF NOT EXISTS กันไว้แล้ว)
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
