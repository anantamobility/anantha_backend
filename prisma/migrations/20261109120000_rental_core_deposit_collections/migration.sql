-- Rental core, security deposit ledger and collection due generation.
-- Forward-only migration: existing rentals receive a generated rental number
-- and a MONTHLY collection period so the new non-null columns can be added
-- without resetting the database.

-- CreateEnum
CREATE TYPE "CollectionPeriod" AS ENUM ('WEEKLY', 'EVERY_15_DAYS', 'MONTHLY');
CREATE TYPE "RentalDueStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');
CREATE TYPE "RentalLedgerEntryType" AS ENUM ('RENT_CHARGED', 'COLLECTION_RECEIVED', 'RENT_ADJUSTMENT', 'REVERSAL');

-- AlterTable rentals
ALTER TABLE "rentals" ADD COLUMN "rentalNumber" TEXT;
UPDATE "rentals"
SET "rentalNumber" = 'RN-' || upper(substr(md5("id"), 1, 12))
WHERE "rentalNumber" IS NULL;
ALTER TABLE "rentals" ALTER COLUMN "rentalNumber" SET NOT NULL;

ALTER TABLE "rentals" ADD COLUMN "collectionPeriod" "CollectionPeriod" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "rentals" ADD COLUMN "activatedAt" TIMESTAMPTZ(3);
ALTER TABLE "rentals" ADD COLUMN "closedAt" TIMESTAMPTZ(3);
ALTER TABLE "rentals" ADD COLUMN "finalOutstandingAmount" DECIMAL(14,2);
ALTER TABLE "rentals" ADD COLUMN "finalDepositBalance" DECIMAL(14,2);
ALTER TABLE "rentals" ADD COLUMN "settlementSnapshot" JSONB;
ALTER TABLE "rentals" ADD COLUMN "createdById" TEXT;
ALTER TABLE "rentals" ADD COLUMN "closedById" TEXT;

CREATE UNIQUE INDEX "rentals_rentalNumber_key" ON "rentals"("rentalNumber");
CREATE INDEX "rentals_status_collectionPeriod_idx" ON "rentals"("status", "collectionPeriod");

ALTER TABLE "rentals"
    ADD CONSTRAINT "rentals_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rentals"
    ADD CONSTRAINT "rentals_closedById_fkey"
    FOREIGN KEY ("closedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- A rental has at most one authoritative deposit record. Multiple receipts,
-- refunds and adjustments are stored as immutable deposit transactions.
CREATE UNIQUE INDEX "deposits_rentalId_key" ON "deposits"("rentalId");

-- AlterTable collections
ALTER TABLE "collections" ADD COLUMN "rentalId" TEXT;
ALTER TABLE "collections" ADD COLUMN "rentalDueId" TEXT;

CREATE INDEX "collections_rentalId_receivedAt_idx" ON "collections"("rentalId", "receivedAt");
CREATE INDEX "collections_rentalDueId_idx" ON "collections"("rentalDueId");
CREATE UNIQUE INDEX "collections_rentalId_referenceNumber_key"
    ON "collections"("rentalId", "referenceNumber");

ALTER TABLE "collections"
    ADD CONSTRAINT "collections_rentalId_fkey"
    FOREIGN KEY ("rentalId") REFERENCES "rentals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable rental_collection_dues
CREATE TABLE "rental_collection_dues" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "dueDate" TIMESTAMPTZ(3) NOT NULL,
    "amountDue" DECIMAL(14,2) NOT NULL,
    "amountCollected" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(14,2) NOT NULL,
    "status" "RentalDueStatus" NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_collection_dues_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rental_collection_dues_rentalId_periodStart_periodEnd_key"
    ON "rental_collection_dues"("rentalId", "periodStart", "periodEnd");
CREATE INDEX "rental_collection_dues_rentalId_status_dueDate_idx"
    ON "rental_collection_dues"("rentalId", "status", "dueDate");
CREATE INDEX "rental_collection_dues_status_dueDate_idx"
    ON "rental_collection_dues"("status", "dueDate");

ALTER TABLE "rental_collection_dues"
    ADD CONSTRAINT "rental_collection_dues_rentalId_fkey"
    FOREIGN KEY ("rentalId") REFERENCES "rentals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "collections"
    ADD CONSTRAINT "collections_rentalDueId_fkey"
    FOREIGN KEY ("rentalDueId") REFERENCES "rental_collection_dues"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable rental_ledger_entries
CREATE TABLE "rental_ledger_entries" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "entryType" "RentalLedgerEntryType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reversesEntryId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rental_ledger_entries_reversesEntryId_key"
    ON "rental_ledger_entries"("reversesEntryId");
CREATE UNIQUE INDEX "rental_ledger_entries_idempotencyKey_key"
    ON "rental_ledger_entries"("idempotencyKey");
CREATE INDEX "rental_ledger_entries_rentalId_occurredAt_idx"
    ON "rental_ledger_entries"("rentalId", "occurredAt");
CREATE INDEX "rental_ledger_entries_sourceType_sourceId_idx"
    ON "rental_ledger_entries"("sourceType", "sourceId");

ALTER TABLE "rental_ledger_entries"
    ADD CONSTRAINT "rental_ledger_entries_rentalId_fkey"
    FOREIGN KEY ("rentalId") REFERENCES "rentals"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rental_ledger_entries"
    ADD CONSTRAINT "rental_ledger_entries_reversesEntryId_fkey"
    FOREIGN KEY ("reversesEntryId") REFERENCES "rental_ledger_entries"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rental_ledger_entries"
    ADD CONSTRAINT "rental_ledger_entries_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
