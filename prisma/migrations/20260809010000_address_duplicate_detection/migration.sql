-- Phone numbers are not a reliable household duplicate key. Clear decisions made
-- under the old rule, then flag only later records whose complete stored address matches.
DROP INDEX IF EXISTS "ix_household_phone_idx";
DROP INDEX IF EXISTS "ix_household_address_dup";
CREATE INDEX "ix_household_address_dup"
  ON "household"("communityId", "houseNo", "mooNo", "soi", "road", "tambonId");

UPDATE "household"
SET
  "hasDuplicateFlag" = FALSE,
  "duplicateResolution" = NULL,
  "duplicateResolvedAt" = NULL,
  "duplicateResolvedById" = NULL;

UPDATE "household" AS newer
SET "hasDuplicateFlag" = TRUE
WHERE newer."deletedAt" IS NULL
  AND newer."houseNo" IS NOT NULL
  AND newer."houseNo" <> ''
  AND newer."mooNo" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "household" AS older
    WHERE older.id <> newer.id
      AND older."deletedAt" IS NULL
      AND older."communityId" = newer."communityId"
      AND older."houseNo" = newer."houseNo"
      AND older."mooNo" = newer."mooNo"
      AND older.soi IS NOT DISTINCT FROM newer.soi
      AND older.road IS NOT DISTINCT FROM newer.road
      AND older."tambonId" IS NOT DISTINCT FROM newer."tambonId"
      AND (
        older."enteredAt" < newer."enteredAt"
        OR (older."enteredAt" = newer."enteredAt" AND older.id < newer.id)
      )
  );
