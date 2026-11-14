-- AlterTable
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "statusChangedAt" TIMESTAMPTZ(3);
