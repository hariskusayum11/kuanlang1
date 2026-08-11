-- Record an explicit verifier decision for households suspected of being duplicates.
CREATE TYPE "DuplicateResolutionEnum" AS ENUM ('CONFIRMED_DUPLICATE', 'NOT_DUPLICATE');

ALTER TABLE "household"
  ADD COLUMN "duplicateResolution" "DuplicateResolutionEnum",
  ADD COLUMN "duplicateResolvedAt" TIMESTAMP(3),
  ADD COLUMN "duplicateResolvedById" TEXT;

CREATE INDEX "household_duplicateResolution_idx" ON "household"("duplicateResolution");
CREATE INDEX "household_duplicateResolvedById_idx" ON "household"("duplicateResolvedById");

ALTER TABLE "household"
  ADD CONSTRAINT "household_duplicateResolvedById_fkey"
  FOREIGN KEY ("duplicateResolvedById") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
