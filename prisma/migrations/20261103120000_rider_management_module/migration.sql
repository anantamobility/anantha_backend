-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "VerificationStatus" ADD VALUE 'NOT_SUBMITTED';
ALTER TYPE "VerificationStatus" ADD VALUE 'UNDER_REVIEW';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "verificationId" TEXT;

-- AlterTable
ALTER TABLE "rider_status_history" ADD COLUMN     "previousStatus" "RiderStatus";

-- AlterTable
ALTER TABLE "rider_verifications" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "riders" ADD COLUMN     "address" JSONB,
ADD COLUMN     "b2bRiderMgmt" "B2BRiderMgmt",
ADD COLUMN     "b2cMode" "B2CMode",
ADD COLUMN     "clientId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "gender" "Gender",
ADD COLUMN     "rentalType" "RentalType",
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "rider_verification_history" (
    "id" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "type" "VerificationType" NOT NULL,
    "previousStatus" "VerificationStatus",
    "status" "VerificationStatus" NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "reviewedById" TEXT,
    "rejectionReason" TEXT,
    "notes" TEXT,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_verification_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rider_verification_history_verificationId_changedAt_idx" ON "rider_verification_history"("verificationId", "changedAt");

-- CreateIndex
CREATE INDEX "rider_verification_history_riderId_type_changedAt_idx" ON "rider_verification_history"("riderId", "type", "changedAt");

-- CreateIndex
CREATE INDEX "documents_verificationId_idx" ON "documents"("verificationId");

-- CreateIndex
CREATE INDEX "documents_deletedAt_idx" ON "documents"("deletedAt");

-- CreateIndex
CREATE INDEX "rider_verifications_status_idx" ON "rider_verifications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rider_verifications_riderId_type_key" ON "rider_verifications"("riderId", "type");

-- CreateIndex
CREATE INDEX "riders_clientId_idx" ON "riders"("clientId");

-- CreateIndex
CREATE INDEX "riders_rentalType_idx" ON "riders"("rentalType");

-- CreateIndex
CREATE INDEX "riders_b2cMode_idx" ON "riders"("b2cMode");

-- CreateIndex
CREATE INDEX "riders_b2bRiderMgmt_idx" ON "riders"("b2bRiderMgmt");

-- CreateIndex
CREATE INDEX "riders_phoneNumber_idx" ON "riders"("phoneNumber");

-- CreateIndex
CREATE INDEX "riders_email_idx" ON "riders"("email");

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "rider_verifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_verification_history" ADD CONSTRAINT "rider_verification_history_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "rider_verifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_verification_history" ADD CONSTRAINT "rider_verification_history_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_verification_history" ADD CONSTRAINT "rider_verification_history_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

