-- =============================================================================
-- SKL-FRIS: PostGIS & Custom SQL Migration
-- ส่วนที่ Prisma จัดการไม่ได้ — ต้อง run หลัง prisma migrate
-- =============================================================================

-- 1. เปิด Extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- สำหรับ Full-text Search ภาษาไทย

-- =============================================================================
-- 2. เพิ่ม Geography Column สำหรับ Household
-- =============================================================================
-- Prisma ไม่รองรับ geography type โดยตรง
-- จึงเก็บ lat/lng เป็น Decimal แยก + สร้าง geography column เพิ่ม

ALTER TABLE "household"
  ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

-- Trigger: อัปเดต location อัตโนมัติเมื่อ lat/lng เปลี่ยน
CREATE OR REPLACE FUNCTION update_household_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(
      ST_MakePoint(NEW.longitude::float, NEW.latitude::float),
      4326
    )::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_household_location ON "household";
CREATE TRIGGER trg_household_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "household"
  FOR EACH ROW
  EXECUTE FUNCTION update_household_location();

-- Spatial Index
CREATE INDEX IF NOT EXISTS ix_household_location
  ON "household" USING GIST ("location");

-- =============================================================================
-- 3. เพิ่ม Geography Column สำหรับ EvacuationSite
-- =============================================================================

ALTER TABLE "evacuation_site"
  ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

CREATE OR REPLACE FUNCTION update_evac_site_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(
      ST_MakePoint(NEW.longitude::float, NEW.latitude::float),
      4326
    )::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_evac_site_location ON "evacuation_site";
CREATE TRIGGER trg_evac_site_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "evacuation_site"
  FOR EACH ROW
  EXECUTE FUNCTION update_evac_site_location();

CREATE INDEX IF NOT EXISTS ix_evac_site_location
  ON "evacuation_site" USING GIST ("location");

-- =============================================================================
-- 4. เพิ่ม Geography Column สำหรับ Community (Boundary Polygon)
-- =============================================================================

ALTER TABLE "community"
  ADD COLUMN IF NOT EXISTS "boundary" geography(Polygon, 4326);

CREATE INDEX IF NOT EXISTS ix_community_boundary
  ON "community" USING GIST ("boundary");

-- =============================================================================
-- 5. Full-text Search ภาษาไทย (ใช้ pg_trgm เพราะ Thai stemmer ไม่มี built-in)
-- =============================================================================

-- Index สำหรับค้นหาชื่อ/ที่อยู่ (Trigram — รองรับภาษาไทย)
CREATE INDEX IF NOT EXISTS ix_household_search_name
  ON "household" USING GIN ("respondentName" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS ix_household_search_place
  ON "household" USING GIN ("placeName" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS ix_household_search_house_no
  ON "household" USING GIN ("houseNo" gin_trgm_ops)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS ix_vulnerable_search_name
  ON "vulnerable_person" USING GIN ("fullName" gin_trgm_ops)
  WHERE "isActive" = true;

-- =============================================================================
-- 6. Audit Log Protection — App User ห้าม UPDATE/DELETE
-- =============================================================================
-- วิธี: สร้าง DB Role แยกสำหรับ App ที่ไม่มีสิทธิ์ UPDATE/DELETE ตาราง audit_log
-- ⚠️ ปรับ role name ตามจริง

-- REVOKE UPDATE, DELETE ON "audit_log" FROM app_user;
-- GRANT INSERT, SELECT ON "audit_log" TO app_user;

-- หรือใช้ Trigger ป้องกัน:
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Audit log records cannot be modified or deleted';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_no_update ON "audit_log";
CREATE TRIGGER trg_audit_no_update
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW
  EXECUTE FUNCTION prevent_audit_modification();

-- =============================================================================
-- 7. Auto-compute Batch Counts (Trigger)
-- =============================================================================

CREATE OR REPLACE FUNCTION update_batch_counts()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "paper_batch"
  SET
    "enteredCount" = (
      SELECT COUNT(*) FROM "paper_sheet"
      WHERE "batchId" = COALESCE(NEW."batchId", OLD."batchId")
        AND "status" NOT IN ('PENDING', 'LOCKED', 'SHEET_LOST', 'MERGED_INTO')
    ),
    "verifiedCount" = (
      SELECT COUNT(*) FROM "paper_sheet"
      WHERE "batchId" = COALESCE(NEW."batchId", OLD."batchId")
        AND "status" = 'VERIFIED'
    ),
    "updatedAt" = NOW()
  WHERE "id" = COALESCE(NEW."batchId", OLD."batchId");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_batch_counts ON "paper_sheet";
CREATE TRIGGER trg_update_batch_counts
  AFTER UPDATE OF status ON "paper_sheet"
  FOR EACH ROW
  EXECUTE FUNCTION update_batch_counts();

-- =============================================================================
-- 8. Auto-unlock Expired Locks (ใช้ Cron หรือ pg_cron)
-- =============================================================================
-- ⚠️ ควรเรียกจาก Application Cron (BullMQ) ทุก 1 นาที
-- แต่เตรียม Function ไว้ให้เรียกได้:

CREATE OR REPLACE FUNCTION release_expired_locks()
RETURNS INTEGER AS $$
DECLARE
  released_count INTEGER;
BEGIN
  UPDATE "paper_sheet"
  SET
    "status" = 'PENDING',
    "lockedById" = NULL,
    "lockedAt" = NULL,
    "lockExpiresAt" = NULL,
    "updatedAt" = NOW()
  WHERE "status" = 'LOCKED'
    AND "lockExpiresAt" < NOW();

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$ LANGUAGE plpgsql;

-- เรียกใช้: SELECT release_expired_locks();

-- =============================================================================
-- 9. Spatial Queries — Prepared Views
-- =============================================================================

-- View: ครัวเรือนพร้อมข้อมูลเสี่ยงสำหรับ GeoJSON Export
CREATE OR REPLACE VIEW v_household_geo AS
SELECT
  h.id,
  h."communityId",
  h."houseNo",
  h."placeName",
  h."memberCount",
  h."hasVulnerable",
  h.latitude,
  h.longitude,
  h.location,
  h."completenessScore",
  h."consentStatus",
  h."surveyedAt",
  h."deletedAt",
  frp."riskLevelFinal",
  frp."riskScoreAuto",
  frp."riskConfidence",
  frp."floorLevelVsRoad",
  frp."hasFloodedBefore",
  frp."maxFloodDepthCm",
  frp."canBeHostHouse",
  ps.status AS "sheetStatus",
  c."nameTh" AS "communityName",
  (SELECT COUNT(*) FROM "vulnerable_person" vp
   WHERE vp."householdId" = h.id AND vp."isActive" = true) AS "vulnerableCount",
  (SELECT COUNT(*) FROM "vulnerable_person" vp
   WHERE vp."householdId" = h.id AND vp."isActive" = true
     AND vp."triageLevel" = 'P1') AS "p1Count"
FROM "household" h
LEFT JOIN "flood_risk_profile" frp ON frp."householdId" = h.id
LEFT JOIN "paper_sheet" ps ON ps.id = h."sheetId"
LEFT JOIN "community" c ON c.id = h."communityId"
WHERE h."deletedAt" IS NULL;

-- View: สรุปรายชุมชนสำหรับ Dashboard
CREATE OR REPLACE VIEW v_community_summary AS
SELECT
  c.id AS "communityId",
  c."nameTh",
  c."targetHouseholds",
  COUNT(DISTINCT h.id) FILTER (WHERE ps.status = 'VERIFIED') AS "verifiedHouseholds",
  COUNT(DISTINCT h.id) AS "totalHouseholds",
  COALESCE(SUM(h."memberCount"), 0) AS "totalPopulation",
  COUNT(DISTINCT vp.id) FILTER (WHERE vp."isActive" = true) AS "vulnerableCount",
  COUNT(DISTINCT vp.id) FILTER (WHERE vp."isActive" = true AND vp."triageLevel" = 'P1') AS "p1Count",
  COUNT(DISTINCT vp.id) FILTER (WHERE vp."isActive" = true AND vp."triageLevel" = 'P2') AS "p2Count",
  COUNT(DISTINCT h.id) FILTER (WHERE frp."riskLevelFinal" = 'CRITICAL') AS "criticalRiskCount",
  COUNT(DISTINCT h.id) FILTER (WHERE frp."riskLevelFinal" = 'HIGH') AS "highRiskCount",
  COUNT(DISTINCT h.id) FILTER (WHERE frp."riskLevelFinal" = 'MEDIUM') AS "mediumRiskCount",
  COUNT(DISTINCT h.id) FILTER (WHERE frp."riskLevelFinal" = 'LOW') AS "lowRiskCount",
  CASE
    WHEN c."targetHouseholds" > 0
    THEN ROUND(COUNT(DISTINCT h.id) FILTER (WHERE ps.status = 'VERIFIED')::numeric
         / c."targetHouseholds" * 100, 1)
    ELSE 0
  END AS "coveragePercent"
FROM "community" c
LEFT JOIN "household" h ON h."communityId" = c.id AND h."deletedAt" IS NULL
LEFT JOIN "paper_sheet" ps ON ps.id = h."sheetId"
LEFT JOIN "flood_risk_profile" frp ON frp."householdId" = h.id
LEFT JOIN "vulnerable_person" vp ON vp."householdId" = h.id
WHERE c."isActive" = true
GROUP BY c.id, c."nameTh", c."targetHouseholds";

-- =============================================================================
-- 10. Check Constraints (เพิ่มจาก Prisma — Prisma ไม่รองรับ CHECK)
-- =============================================================================

ALTER TABLE "household"
  ADD CONSTRAINT ck_member_count
    CHECK ("memberCount" IS NULL OR ("memberCount" >= 1 AND "memberCount" <= 50));

ALTER TABLE "vulnerable_person"
  ADD CONSTRAINT ck_age
    CHECK ("age" IS NULL OR ("age" >= 0 AND "age" <= 120));

ALTER TABLE "flood_risk_profile"
  ADD CONSTRAINT ck_flood_depth
    CHECK ("maxFloodDepthCm" IS NULL OR ("maxFloodDepthCm" >= 0 AND "maxFloodDepthCm" <= 1000));

ALTER TABLE "flood_risk_profile"
  ADD CONSTRAINT ck_flood_duration
    CHECK ("lastFloodDurationDays" IS NULL OR ("lastFloodDurationDays" >= 1 AND "lastFloodDurationDays" <= 365));

ALTER TABLE "person_vulnerability"
  ADD CONSTRAINT ck_pregnancy_weeks
    CHECK ("pregnancyWeeks" IS NULL OR ("pregnancyWeeks" >= 1 AND "pregnancyWeeks" <= 42));

ALTER TABLE "flood_risk_profile"
  ADD CONSTRAINT ck_risk_score
    CHECK ("riskScoreAuto" IS NULL OR ("riskScoreAuto" >= 0 AND "riskScoreAuto" <= 100));

ALTER TABLE "flood_risk_profile"
  ADD CONSTRAINT ck_risk_confidence
    CHECK ("riskConfidence" IS NULL OR ("riskConfidence" >= 0 AND "riskConfidence" <= 1));

-- ⭐ พิกัดต้องอยู่ใน อ.หาดใหญ่ คร่าวๆ (BR-03) — ใช้เป็น soft check ที่ Application
-- ไม่ใส่ CHECK ที่ DB เพราะอาจต้อง override ด้วยเหตุผล
