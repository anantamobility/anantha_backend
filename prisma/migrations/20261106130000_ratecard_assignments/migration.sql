-- Ratecards become reusable pricing configurations. Client links move into
-- RateCardAssignment so a ratecard can serve any number of clients.

CREATE TYPE "RateCardAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CANCELLED');

ALTER TABLE "rate_cards" ADD COLUMN "vehicleCategory" TEXT;
ALTER TABLE "rentals" ADD COLUMN "rateCardAssignmentId" TEXT;

CREATE TABLE "rate_card_assignments" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "validFrom" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMPTZ(3),
    "status" "RateCardAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedById" TEXT,
    "unassignedAt" TIMESTAMPTZ(3),
    "unassignedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_card_assignments_pkey" PRIMARY KEY ("id")
);

-- Backfill the former one-client-per-ratecard relationship. The ratecard UUID
-- is unique in the old schema and is reused as the assignment UUID; the new
-- table is empty, so this cannot collide with an existing assignment.
INSERT INTO "rate_card_assignments" (
    "id",
    "clientId",
    "rateCardId",
    "validFrom",
    "validUntil",
    "status",
    "assignedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "clientId",
    "id",
    "effectiveFrom",
    "effectiveTo",
    CASE WHEN "isActive" THEN 'ACTIVE'::"RateCardAssignmentStatus"
         ELSE 'INACTIVE'::"RateCardAssignmentStatus" END,
    "createdAt",
    "createdAt",
    "updatedAt"
FROM "rate_cards"
WHERE "clientId" IS NOT NULL;

CREATE INDEX "rate_card_assignments_clientId_status_validFrom_idx"
    ON "rate_card_assignments"("clientId", "status", "validFrom");
CREATE INDEX "rate_card_assignments_rateCardId_status_validFrom_idx"
    ON "rate_card_assignments"("rateCardId", "status", "validFrom");
CREATE INDEX "rate_card_assignments_validUntil_idx"
    ON "rate_card_assignments"("validUntil");
CREATE INDEX "rate_cards_vehicleCategory_idx" ON "rate_cards"("vehicleCategory");
CREATE INDEX "rentals_rateCardAssignmentId_idx" ON "rentals"("rateCardAssignmentId");

-- A client may hold at most one ACTIVE assignment for a given ratecard.
-- Inactive/cancelled rows remain as history and do not block re-assignment.
CREATE UNIQUE INDEX "rate_card_assignments_active_pair_key"
    ON "rate_card_assignments"("clientId", "rateCardId")
    WHERE "status" = 'ACTIVE';

ALTER TABLE "rate_card_assignments"
    ADD CONSTRAINT "rate_card_assignments_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rate_card_assignments"
    ADD CONSTRAINT "rate_card_assignments_rateCardId_fkey"
    FOREIGN KEY ("rateCardId") REFERENCES "rate_cards"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rate_card_assignments"
    ADD CONSTRAINT "rate_card_assignments_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rate_card_assignments"
    ADD CONSTRAINT "rate_card_assignments_unassignedById_fkey"
    FOREIGN KEY ("unassignedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rentals"
    ADD CONSTRAINT "rentals_rateCardAssignmentId_fkey"
    FOREIGN KEY ("rateCardAssignmentId") REFERENCES "rate_card_assignments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "rate_cards_clientId_effectiveFrom_idx";
DROP INDEX "rate_cards_clientId_isActive_effectiveFrom_idx";
ALTER TABLE "rate_cards" DROP CONSTRAINT "rate_cards_clientId_fkey";
ALTER TABLE "rate_cards" DROP COLUMN "clientId";
