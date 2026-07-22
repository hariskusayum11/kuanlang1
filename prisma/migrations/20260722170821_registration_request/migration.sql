-- CreateEnum
CREATE TYPE "RegistrationRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "registration_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestedRole" "UserRoleEnum" NOT NULL,
    "organization" TEXT,
    "communityId" TEXT,
    "note" TEXT,
    "status" "RegistrationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_request_userId_key" ON "registration_request"("userId");

-- CreateIndex
CREATE INDEX "registration_request_status_createdAt_idx" ON "registration_request"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "registration_request" ADD CONSTRAINT "registration_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_request" ADD CONSTRAINT "registration_request_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registration_request" ADD CONSTRAINT "registration_request_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
