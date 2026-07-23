/*
  Warnings:

  - You are about to drop the column `respondentName` on the `household` table. All the data in the column will be lost.
  - You are about to drop the column `fullName` on the `vulnerable_person` table. All the data in the column will be lost.
  - You are about to drop the column `fullNameStatus` on the `vulnerable_person` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "household" DROP COLUMN "respondentName",
ADD COLUMN     "respondentFirstName" TEXT,
ADD COLUMN     "respondentLastName" TEXT,
ADD COLUMN     "respondentPrefixId" TEXT;

-- AlterTable
ALTER TABLE "vulnerable_person" DROP COLUMN "fullName",
DROP COLUMN "fullNameStatus",
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "namePrefixId" TEXT,
ADD COLUMN     "nameStatus" "FieldStatusEnum" NOT NULL DEFAULT 'HAS_VALUE';

-- CreateTable
CREATE TABLE "name_prefix" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "name_prefix_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "name_prefix_code_key" ON "name_prefix"("code");

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_respondentPrefixId_fkey" FOREIGN KEY ("respondentPrefixId") REFERENCES "name_prefix"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerable_person" ADD CONSTRAINT "vulnerable_person_namePrefixId_fkey" FOREIGN KEY ("namePrefixId") REFERENCES "name_prefix"("id") ON DELETE SET NULL ON UPDATE CASCADE;
