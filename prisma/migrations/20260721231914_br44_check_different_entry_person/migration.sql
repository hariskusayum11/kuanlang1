-- =============================================================================
-- SKL-FRIS Custom SQL Migration — BR-44 / FR-VER-03 / SCH-03
-- Trigger: check_different_entry_person บน "entry_attempt"
-- กติกา: คนเดียวกันห้ามคีย์ทั้ง Entry 1 และ Entry 2 ของใบ (sheetId) เดียวกัน
-- ขอบเขต: BR-44 เท่านั้น — ไม่มี partial unique / GIST / GIN / views (รอ migration ถัดไป)
-- Idempotent: CREATE OR REPLACE FUNCTION + DROP TRIGGER IF EXISTS
-- ต้องรันหลัง init_schema_v1 (ตาราง entry_attempt ต้องมีแล้ว) — คำตัดสิน #15 (docs/16)
-- =============================================================================

CREATE OR REPLACE FUNCTION check_different_entry_person()
RETURNS TRIGGER AS $$
BEGIN
  -- กัน race สอง transaction insert พร้อมกัน (EXISTS มองไม่เห็น uncommitted rows)
  -- → serialize ต่อใบด้วย advisory lock ระดับ transaction (ปลดอัตโนมัติเมื่อ commit/rollback)
  PERFORM pg_advisory_xact_lock(hashtext('entry_attempt:' || NEW."sheetId"));

  IF EXISTS (
    SELECT 1 FROM "entry_attempt"
    WHERE "sheetId" = NEW."sheetId"
      AND "enteredById" = NEW."enteredById"
      AND "attemptNo" <> NEW."attemptNo"
      AND "id" <> NEW."id" -- กันชนกับแถวตัวเองกรณี UPDATE
  ) THEN
    RAISE EXCEPTION 'BR-44: ผู้ใช้ % คีย์ใบ % ไปแล้ว ห้ามคีย์รอบที่ % ซ้ำ',
      NEW."enteredById", NEW."sheetId", NEW."attemptNo";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entry_different_person ON "entry_attempt";

-- ครอบทั้ง INSERT และ UPDATE ของฟิลด์ที่เกี่ยวข้อง — draft เดิมมีเฉพาะ INSERT
-- ซึ่งเปิดช่อง bypass ด้วยการ UPDATE "enteredById" ทีหลัง
CREATE TRIGGER trg_entry_different_person
  BEFORE INSERT OR UPDATE OF "sheetId", "enteredById", "attemptNo" ON "entry_attempt"
  FOR EACH ROW EXECUTE FUNCTION check_different_entry_person();
