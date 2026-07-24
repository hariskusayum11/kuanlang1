/*
  Warnings:

  - You are about to drop the column `surveyorNameOnPaper` on the `household` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "household" DROP COLUMN "surveyorNameOnPaper",
ADD COLUMN     "respondentPrefixOther" TEXT,
ADD COLUMN     "surveyorFirstNameOnPaper" TEXT,
ADD COLUMN     "surveyorLastNameOnPaper" TEXT,
ADD COLUMN     "surveyorPrefixId" TEXT,
ADD COLUMN     "surveyorPrefixOther" TEXT;

-- AlterTable
ALTER TABLE "vulnerable_person" ADD COLUMN     "prefixOther" TEXT;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_surveyorPrefixId_fkey" FOREIGN KEY ("surveyorPrefixId") REFERENCES "name_prefix"("id") ON DELETE SET NULL ON UPDATE CASCADE;
