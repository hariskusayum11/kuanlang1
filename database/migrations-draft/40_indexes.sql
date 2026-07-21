-- =============================================================================
-- SKL-FRIS Custom SQL — 40 Indexes (Spatial + Trigram)
-- ต้องรัน "หลัง" 10_postgis_columns
-- Idempotent (CREATE INDEX IF NOT EXISTS)
-- ⚠️ DRAFT — ยังไม่ Apply
-- =============================================================================

-- Spatial GIST (Partial — เฉพาะที่มีพิกัดและไม่ถูกลบ)
CREATE INDEX IF NOT EXISTS ix_household_location
  ON "household" USING GIST ("location")
  WHERE "location" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS ix_evac_site_location
  ON "evacuation_site" USING GIST ("location");

CREATE INDEX IF NOT EXISTS ix_community_boundary_geom
  ON "community_boundary" USING GIST ("geom");

-- Full-text ภาษาไทย (Trigram) — ยังใช้ได้เพราะชื่อ "ไม่เข้ารหัส App" (R2-#5)
CREATE INDEX IF NOT EXISTS ix_household_search_name
  ON "household" USING GIN ("respondentName" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS ix_household_search_place
  ON "household" USING GIN ("placeName" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

-- แก้ SQL-15: ค้นหาชื่อคนเปราะบางต้องไม่เจอคนในบ้านที่ถูกลบ
-- (Partial index อ้าง column ของตารางเดียวได้เท่านั้น → ใช้ isActive; การกรอง household.deletedAt
--  ทำที่ Query ผ่าน JOIN — บันทึกไว้ที่ Repository layer)
CREATE INDEX IF NOT EXISTS ix_vulnerable_search_name
  ON "vulnerable_person" USING GIN ("fullName" gin_trgm_ops)
  WHERE "isActive" = true;
