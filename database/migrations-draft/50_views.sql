-- =============================================================================
-- SKL-FRIS Custom SQL — 50 Views
-- ต้องรัน "หลัง" Prisma tables + PostGIS columns
-- Idempotent (DROP VIEW IF EXISTS ก่อน CREATE — SQL-10)
-- ⚠️ DRAFT — ยังไม่ Apply
-- ⚠️ ไม่มีคอลัมน์ Risk Level/Final (WAITING_FOR_BUSINESS_RULE — ถูกลบจาก schema)
-- =============================================================================

-- ลบ View เดิม (ถ้ามี) ที่อ้างคอลัมน์ที่ถูกลบ
DROP VIEW IF EXISTS v_community_summary;
DROP VIEW IF EXISTS v_household_geo;

-- -----------------------------------------------------------------------------
-- 1) Coverage รายชุมชน — NULL-aware (คำตัดสิน #1,#2)
--    verifiedCoveragePercent = NULL เมื่อ totalHouseholds IS NULL/<=0 (ไม่ใช่ 0)
--    เกณฑ์ผ่าน = percent > targetCoveragePercent (ตรวจที่ App/Domain — coverage.ts)
--    ใช้ Subquery แยกกัน Fan-out (COV-02); ไม่นับ Duplicate/Merged
-- -----------------------------------------------------------------------------
CREATE VIEW v_community_coverage AS
SELECT
  c.id                        AS "communityId",
  c.code                      AS "communityCode",
  c."nameTh"                  AS "communityName",
  c."totalHouseholds",
  c."targetCoveragePercent",
  c."lastPopulationUpdatedAt",
  c."populationDataSource",

  COALESCE((
    SELECT COUNT(*) FROM "paper_sheet" ps
    JOIN "paper_batch" pb ON pb.id = ps."batchId"
    WHERE pb."communityId" = c.id AND ps.status NOT IN ('SHEET_LOST','MERGED_INTO')
  ), 0)                       AS "receivedSurveyCount",

  COALESCE((
    SELECT COUNT(*) FROM "paper_sheet" ps
    JOIN "paper_batch" pb ON pb.id = ps."batchId"
    WHERE pb."communityId" = c.id
      AND ps.status IN ('ENTERED_1','ENTERED_2','DISCREPANCY','NEEDS_FIELD_QUERY','VERIFIED')
  ), 0)                       AS "enteredSurveyCount",

  COALESCE((
    SELECT COUNT(DISTINCT h.id) FROM "household" h
    JOIN "paper_sheet" ps ON ps.id = h."sheetId"
    WHERE h."communityId" = c.id
      AND h."deletedAt" IS NULL
      AND h."hasDuplicateFlag" = false
      AND ps.status = 'VERIFIED'
  ), 0)                       AS "verifiedHouseholdCount",

  CASE WHEN c."totalHouseholds" IS NULL OR c."totalHouseholds" <= 0 THEN NULL
       ELSE ROUND(
         (SELECT COUNT(*) FROM "paper_sheet" ps
          JOIN "paper_batch" pb ON pb.id = ps."batchId"
          WHERE pb."communityId" = c.id AND ps.status NOT IN ('SHEET_LOST','MERGED_INTO'))::numeric
         / c."totalHouseholds" * 100, 1)
  END                         AS "surveyCoveragePercent",

  CASE WHEN c."totalHouseholds" IS NULL OR c."totalHouseholds" <= 0 THEN NULL
       ELSE ROUND(
         (SELECT COUNT(DISTINCT h.id) FROM "household" h
          JOIN "paper_sheet" ps ON ps.id = h."sheetId"
          WHERE h."communityId" = c.id AND h."deletedAt" IS NULL
            AND h."hasDuplicateFlag" = false AND ps.status = 'VERIFIED')::numeric
         / c."totalHouseholds" * 100, 1)
  END                         AS "verifiedCoveragePercent"

FROM "community" c
WHERE c."isActive" = true AND c."deletedAt" IS NULL;

-- -----------------------------------------------------------------------------
-- 2) Household Geo (Internal เท่านั้น — มี L3) — กรอง VERIFIED + ไม่ Duplicate/Deleted
--    ⚠️ ห้ามใช้กับ Public API (SQL-06)
-- -----------------------------------------------------------------------------
CREATE VIEW v_household_geo_internal AS
SELECT
  h.id, h."communityId", h."houseNo", h."placeName",
  h."memberCount", h."hasVulnerable",
  h.latitude, h.longitude, h.location,
  h."completenessScore", h."consentStatus", h."surveyedAt",
  frp."floorLevelVsRoad", frp."hasFloodedBefore", frp."maxFloodDepthCm",
  frp."rawScore", frp."maximumPossibleScore", frp."normalizedScore",
  c."nameTh" AS "communityName"
FROM "household" h
JOIN "paper_sheet" ps ON ps.id = h."sheetId"
LEFT JOIN "flood_risk_profile" frp ON frp."householdId" = h.id
LEFT JOIN "community" c ON c.id = h."communityId"
WHERE h."deletedAt" IS NULL
  AND h."hasDuplicateFlag" = false
  AND ps.status = 'VERIFIED';

-- -----------------------------------------------------------------------------
-- 3) Public Community Stats — Aggregate ล้วน (R2-#5)
--    ⚠️ ห้ามมี: ชื่อ/เบอร์/บ้านเลขที่/ข้อมูลสุขภาพ/พิกัดรายบ้าน
-- -----------------------------------------------------------------------------
CREATE VIEW v_public_community_stats AS
SELECT
  c.id                        AS "communityId",
  c."nameTh"                  AS "communityName",
  COALESCE((
    SELECT COUNT(DISTINCT h.id) FROM "household" h
    JOIN "paper_sheet" ps ON ps.id = h."sheetId"
    WHERE h."communityId" = c.id AND h."deletedAt" IS NULL
      AND h."hasDuplicateFlag" = false AND ps.status = 'VERIFIED'
  ), 0)                       AS "verifiedHouseholdCount",
  COALESCE((
    SELECT COUNT(*) FROM "evacuation_site" es
    WHERE es."communityId" = c.id AND es."isActive" = true
  ), 0)                       AS "evacuationSiteCount"
FROM "community" c
WHERE c."isActive" = true AND c."deletedAt" IS NULL;
