-- =============================================================================
-- SKL-FRIS Custom SQL — 20 Functions & Triggers
-- ต้องรัน "หลัง" Prisma tables + 10_postgis_columns
-- Idempotent (CREATE OR REPLACE + DROP TRIGGER IF EXISTS)
-- ⚠️ DRAFT — ยังไม่ Apply
-- ⚠️ ไม่มี Risk Final Trigger (WAITING_FOR_BUSINESS_RULE)
-- ⚠️ ไม่มี Encryption SQL (WAITING_FOR_LEGAL_DECISION)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Household.location = ST_MakePoint(lng, lat) — ลำดับ lng ก่อน lat
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_household_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude::float, NEW.latitude::float), 4326)::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_household_location ON "household";
CREATE TRIGGER trg_household_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "household"
  FOR EACH ROW EXECUTE FUNCTION update_household_location();

-- -----------------------------------------------------------------------------
-- 2) EvacuationSite.location
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_evac_site_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude::float, NEW.latitude::float), 4326)::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_evac_site_location ON "evacuation_site";
CREATE TRIGGER trg_evac_site_location
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "evacuation_site"
  FOR EACH ROW EXECUTE FUNCTION update_evac_site_location();

-- -----------------------------------------------------------------------------
-- 3) ⭐ ป้องกันคนเดียวกันคีย์ Entry 1 และ Entry 2 (SCH-03 / BR-44 / FR-VER-03)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_different_entry_person()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "entry_attempt"
    WHERE "sheetId" = NEW."sheetId"
      AND "enteredById" = NEW."enteredById"
      AND "attemptNo" <> NEW."attemptNo"
  ) THEN
    RAISE EXCEPTION 'BR-44: ผู้ใช้ % คีย์ใบ % ไปแล้ว ห้ามคีย์รอบที่ % ซ้ำ',
      NEW."enteredById", NEW."sheetId", NEW."attemptNo";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entry_different_person ON "entry_attempt";
CREATE TRIGGER trg_entry_different_person
  BEFORE INSERT ON "entry_attempt"
  FOR EACH ROW EXECUTE FUNCTION check_different_entry_person();

-- -----------------------------------------------------------------------------
-- 4) Batch Count Trigger — รองรับ INSERT/DELETE/UPDATE status/batchId + receivedCount
--    (SQL-04) — อัปเดตทั้ง Batch เก่าและใหม่
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_batch_counts()
RETURNS TRIGGER AS $$
DECLARE
  affected TEXT[];
  b TEXT;
BEGIN
  affected := ARRAY(
    SELECT DISTINCT x FROM unnest(ARRAY[
      CASE WHEN TG_OP <> 'DELETE' THEN NEW."batchId" END,
      CASE WHEN TG_OP <> 'INSERT' THEN OLD."batchId" END
    ]) AS x WHERE x IS NOT NULL
  );

  FOREACH b IN ARRAY affected LOOP
    UPDATE "paper_batch" SET
      "receivedCount" = (SELECT COUNT(*) FROM "paper_sheet"
                         WHERE "batchId" = b AND "status" <> 'SHEET_LOST'),
      "enteredCount"  = (SELECT COUNT(*) FROM "paper_sheet"
                         WHERE "batchId" = b
                           AND "status" IN ('ENTERED_1','ENTERED_2','DISCREPANCY','NEEDS_FIELD_QUERY','VERIFIED')),
      "verifiedCount" = (SELECT COUNT(*) FROM "paper_sheet"
                         WHERE "batchId" = b AND "status" = 'VERIFIED'),
      "updatedAt" = NOW()
    WHERE "id" = b;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_batch_counts ON "paper_sheet";
CREATE TRIGGER trg_update_batch_counts
  AFTER INSERT OR DELETE OR UPDATE OF status, "batchId" ON "paper_sheet"
  FOR EACH ROW EXECUTE FUNCTION update_batch_counts();

-- -----------------------------------------------------------------------------
-- 5) ปลด Lock ค้าง (เรียกจาก Cron/BullMQ) — แก้ให้เขียน Audit + lock_timeout (SQL-05)
--    หมายเหตุ: Race กับ Submit ต้องกันที่ Application (WHERE lockedById + lockExpiresAt>NOW())
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_expired_locks()
RETURNS INTEGER AS $$
DECLARE released_count INTEGER;
BEGIN
  SET LOCAL lock_timeout = '2s';

  WITH expired AS (
    UPDATE "paper_sheet"
    SET "status" = 'PENDING', "lockedById" = NULL, "lockedAt" = NULL,
        "lockExpiresAt" = NULL, "updatedAt" = NOW()
    WHERE "status" = 'LOCKED' AND "lockExpiresAt" < NOW()
    RETURNING "id", "lockedById"
  )
  INSERT INTO "audit_log" ("id","action","entityType","entityId","reason","createdAt")
  SELECT gen_random_uuid()::text, 'UNLOCK', 'PaperSheet', "id",
         'auto-release expired lock', NOW()
  FROM expired;

  GET DIAGNOSTICS released_count = ROW_COUNT;
  RETURN released_count;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 6) Audit Log Append-only — bugfix RETURN OLD (SQL-09)
--    ⚠️ Retention DELETE (5 ปี) = WAITING_FOR_LEGAL_DECISION → ยังไม่เปิด
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Audit log records cannot be modified';
  END IF;
  -- DELETE: ยังไม่อนุญาต (รอ PDPA Retention policy)
  RAISE EXCEPTION 'Audit log records cannot be deleted (retention policy pending PDPA)';
  RETURN OLD; -- ป้องกันกับดัก RETURN NULL (ยกเลิกเงียบ)
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_no_update ON "audit_log";
CREATE TRIGGER trg_audit_no_update
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
