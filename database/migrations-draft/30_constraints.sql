-- =============================================================================
-- SKL-FRIS Custom SQL — 30 Constraints
-- ต้องรัน "หลัง" Prisma tables
-- Idempotent (DO $$ IF NOT EXISTS — เพราะ PostgreSQL ไม่มี ADD CONSTRAINT IF NOT EXISTS)
-- ⚠️ DRAFT — ยังไม่ Apply
-- =============================================================================

-- helper macro-style: ใช้ DO block เช็ค pg_constraint ก่อน ADD

-- memberCount 0-5000 (SQL-12: โรงเรียน/โรงงานเกิน 50 ได้; บ้านร้าง 0)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_member_count' AND conrelid='"household"'::regclass) THEN
    ALTER TABLE "household" ADD CONSTRAINT ck_member_count
      CHECK ("memberCount" IS NULL OR ("memberCount" >= 0 AND "memberCount" <= 5000));
  END IF;
END $$;

-- age 0-120
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_age' AND conrelid='"vulnerable_person"'::regclass) THEN
    ALTER TABLE "vulnerable_person" ADD CONSTRAINT ck_age
      CHECK ("age" IS NULL OR ("age" >= 0 AND "age" <= 120));
  END IF;
END $$;

-- flood depth (derived) ≤ 1000 ซม.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_flood_depth' AND conrelid='"flood_risk_profile"'::regclass) THEN
    ALTER TABLE "flood_risk_profile" ADD CONSTRAINT ck_flood_depth
      CHECK ("maxFloodDepthCm" IS NULL OR ("maxFloodDepthCm" >= 0 AND "maxFloodDepthCm" <= 1000));
  END IF;
END $$;

-- flood duration 1-365
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_flood_duration' AND conrelid='"flood_risk_profile"'::regclass) THEN
    ALTER TABLE "flood_risk_profile" ADD CONSTRAINT ck_flood_duration
      CHECK ("lastFloodDurationDays" IS NULL OR ("lastFloodDurationDays" >= 1 AND "lastFloodDurationDays" <= 365));
  END IF;
END $$;

-- pregnancyWeeks (derived) 1-45 (ผ่อนจาก 42 — conversion ยังไม่ทำ, รอ Q-14)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_pregnancy_weeks' AND conrelid='"person_vulnerability"'::regclass) THEN
    ALTER TABLE "person_vulnerability" ADD CONSTRAINT ck_pregnancy_weeks
      CHECK ("pregnancyWeeks" IS NULL OR ("pregnancyWeeks" >= 1 AND "pregnancyWeeks" <= 45));
  END IF;
END $$;

-- ⭐ RISK-01: rawScore >= 0 (ไม่ hardcode 115), rawScore <= maximumPossibleScore, normalizedScore 0-100
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_raw_score' AND conrelid='"flood_risk_profile"'::regclass) THEN
    ALTER TABLE "flood_risk_profile" ADD CONSTRAINT ck_raw_score
      CHECK ("rawScore" IS NULL OR "rawScore" >= 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_raw_le_max' AND conrelid='"flood_risk_profile"'::regclass) THEN
    ALTER TABLE "flood_risk_profile" ADD CONSTRAINT ck_raw_le_max
      CHECK ("rawScore" IS NULL OR "maximumPossibleScore" IS NULL OR "rawScore" <= "maximumPossibleScore");
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_normalized_score' AND conrelid='"flood_risk_profile"'::regclass) THEN
    ALTER TABLE "flood_risk_profile" ADD CONSTRAINT ck_normalized_score
      CHECK ("normalizedScore" IS NULL OR ("normalizedScore" >= 0 AND "normalizedScore" <= 100));
  END IF;
END $$;

-- ⭐ Coverage: totalHouseholds NULL OR > 0 (คำตัดสิน #1: ห้าม 0); targetCoveragePercent 0-100
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_community_total_households' AND conrelid='"community"'::regclass) THEN
    ALTER TABLE "community" ADD CONSTRAINT ck_community_total_households
      CHECK ("totalHouseholds" IS NULL OR "totalHouseholds" > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_community_target_coverage' AND conrelid='"community"'::regclass) THEN
    ALTER TABLE "community" ADD CONSTRAINT ck_community_target_coverage
      CHECK ("targetCoveragePercent" > 0 AND "targetCoveragePercent" <= 100);
  END IF;
END $$;

-- ⭐ Partial Unique: แต่ละชุมชนมีตำบลหลัก (isPrimary=true) ได้ ≤ 1 (อนุญาต 0) — คำตัดสิน #8
CREATE UNIQUE INDEX IF NOT EXISTS ux_community_primary_tambon
  ON "community_tambon" ("communityId")
  WHERE "isPrimary" = true;
