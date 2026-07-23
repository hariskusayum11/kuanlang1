-- AlterTable
ALTER TABLE "household" ADD COLUMN     "respondentPhoneIdx" VARCHAR(64);

-- CreateIndex
CREATE INDEX "ix_household_phone_idx" ON "household"("respondentPhoneIdx");
