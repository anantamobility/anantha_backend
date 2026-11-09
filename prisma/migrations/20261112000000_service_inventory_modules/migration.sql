-- Service management, rental pause/resume, replacement assignment,
-- responsibility approvals and spares/inventory ledger.
-- Forward-only migration: existing service and inventory rows are backfilled
-- instead of resetting the database.

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE "RentalPauseStatus" AS ENUM ('ACTIVE', 'RESUMED', 'CANCELLED');

ALTER TYPE "InventoryMovementType" ADD VALUE 'OPENING_STOCK';
ALTER TYPE "InventoryMovementType" ADD VALUE 'PURCHASE_IN';
ALTER TYPE "InventoryMovementType" ADD VALUE 'SERVICE_CONSUMPTION';
ALTER TYPE "InventoryMovementType" ADD VALUE 'MANUAL_ADJUSTMENT';
ALTER TYPE "InventoryMovementType" ADD VALUE 'SERVICE_RETURN';
ALTER TYPE "InventoryMovementType" ADD VALUE 'DAMAGED_STOCK';

ALTER TYPE "ServiceStatus" ADD VALUE 'CLOSED';

-- ============================================================
-- SERVICE
-- ============================================================
ALTER TABLE "services"
  ADD COLUMN "assignedToId" TEXT,
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(3),
  ADD COLUMN "closedAt" TIMESTAMPTZ(3),
  ADD COLUMN "diagnosis" TEXT,
  ADD COLUMN "downtimeReason" TEXT,
  ADD COLUMN "previousVehicleStatus" "VehicleStatus",
  ADD COLUMN "repairNotes" TEXT,
  ADD COLUMN "responsibilityApprovedAt" TIMESTAMPTZ(3),
  ADD COLUMN "responsibilityEvidence" JSONB,
  ADD COLUMN "responsibilityInvestigationNotes" TEXT;

-- Backfill a stable human-readable service number for any pre-existing rows.
ALTER TABLE "services" ADD COLUMN "serviceNumber" TEXT;
UPDATE "services"
SET "serviceNumber" = 'SVC-' || upper(substr(md5("id"), 1, 12))
WHERE "serviceNumber" IS NULL;
ALTER TABLE "services" ALTER COLUMN "serviceNumber" SET NOT NULL;

ALTER TABLE "service_charges"
  ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'INR',
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "serviceSpareId" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "sourceType" TEXT;

ALTER TABLE "service_spares" ADD COLUMN "idempotencyKey" TEXT;

-- ============================================================
-- SPARES + INVENTORY
-- ============================================================
ALTER TABLE "spares"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "currency" CHAR(3) NOT NULL DEFAULT 'INR',
  ADD COLUMN "minimumStock" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "purchasePrice" DECIMAL(14,4),
  ADD COLUMN "unitOfMeasure" TEXT NOT NULL DEFAULT 'UNIT';

ALTER TABLE "inventory_movements"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "hubId" TEXT,
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "quantityDelta" INTEGER;

-- Derive a signed delta for historical rows so the ledger stays valid.
UPDATE "inventory_movements"
SET "quantityDelta" = CASE
  WHEN "movementType" IN ('PURCHASE', 'RETURN') THEN "quantity"
  WHEN "movementType" IN ('ISSUE_TO_SERVICE', 'WRITE_OFF') THEN -"quantity"
  ELSE "quantity"
END
WHERE "quantityDelta" IS NULL;

ALTER TABLE "inventory_movements" ALTER COLUMN "quantityDelta" SET NOT NULL;

-- ============================================================
-- NEW TABLES
-- ============================================================
CREATE TABLE "service_responsibility_approvals" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "responsibility" "ResponsibleParty" NOT NULL,
    "previousResponsibility" "ResponsibleParty",
    "investigationNotes" TEXT NOT NULL,
    "evidence" JSONB,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_responsibility_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rental_pauses" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "status" "RentalPauseStatus" NOT NULL DEFAULT 'ACTIVE',
    "previousRentalStatus" "RentalStatus" NOT NULL,
    "pausedAt" TIMESTAMPTZ(3) NOT NULL,
    "resumedAt" TIMESTAMPTZ(3),
    "reason" TEXT,
    "pausedById" TEXT,
    "resumedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_pauses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "replacement_assignments" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "originalVehicleId" TEXT NOT NULL,
    "replacementVehicleId" TEXT NOT NULL,
    "rentalId" TEXT,
    "replacementRentalId" TEXT,
    "riderId" TEXT,
    "clientId" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMPTZ(3),
    "assignedById" TEXT,
    "returnedById" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "replacement_assignments_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX "service_responsibility_approvals_serviceId_approvedAt_idx" ON "service_responsibility_approvals"("serviceId", "approvedAt");

CREATE UNIQUE INDEX "rental_pauses_serviceId_key" ON "rental_pauses"("serviceId");
CREATE INDEX "rental_pauses_rentalId_status_idx" ON "rental_pauses"("rentalId", "status");
CREATE INDEX "rental_pauses_rentalId_pausedAt_idx" ON "rental_pauses"("rentalId", "pausedAt");

CREATE INDEX "replacement_assignments_serviceId_status_idx" ON "replacement_assignments"("serviceId", "status");
CREATE INDEX "replacement_assignments_replacementVehicleId_status_idx" ON "replacement_assignments"("replacementVehicleId", "status");
CREATE INDEX "replacement_assignments_originalVehicleId_idx" ON "replacement_assignments"("originalVehicleId");
CREATE INDEX "replacement_assignments_rentalId_idx" ON "replacement_assignments"("rentalId");
CREATE INDEX "replacement_assignments_replacementRentalId_idx" ON "replacement_assignments"("replacementRentalId");

CREATE UNIQUE INDEX "inventory_movements_idempotencyKey_key" ON "inventory_movements"("idempotencyKey");
CREATE INDEX "inventory_movements_spareId_hubId_movedAt_idx" ON "inventory_movements"("spareId", "hubId", "movedAt");
CREATE INDEX "inventory_movements_referenceType_referenceId_idx" ON "inventory_movements"("referenceType", "referenceId");

CREATE UNIQUE INDEX "service_charges_idempotencyKey_key" ON "service_charges"("idempotencyKey");
CREATE UNIQUE INDEX "service_charges_serviceSpareId_key" ON "service_charges"("serviceSpareId");
CREATE INDEX "service_charges_sourceType_sourceId_idx" ON "service_charges"("sourceType", "sourceId");

CREATE UNIQUE INDEX "service_spares_idempotencyKey_key" ON "service_spares"("idempotencyKey");
CREATE UNIQUE INDEX "services_serviceNumber_key" ON "services"("serviceNumber");
CREATE INDEX "services_status_idx" ON "services"("status");

CREATE INDEX "spares_name_idx" ON "spares"("name");
CREATE INDEX "spares_category_idx" ON "spares"("category");
CREATE INDEX "spares_isActive_idx" ON "spares"("isActive");

-- ============================================================
-- INTEGRITY GUARDS
-- ============================================================
-- A vehicle may have at most one active service downtime period.
CREATE UNIQUE INDEX "services_active_downtime_vehicle_key"
  ON "services"("vehicleId")
  WHERE "downtimeEnd" IS NULL AND "downtimeStart" IS NOT NULL;

-- A service may have at most one active replacement vehicle, and a
-- replacement vehicle may serve at most one active replacement assignment.
CREATE UNIQUE INDEX "replacement_assignments_active_service_key"
  ON "replacement_assignments"("serviceId")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "replacement_assignments_active_vehicle_key"
  ON "replacement_assignments"("replacementVehicleId")
  WHERE "status" = 'ACTIVE';

ALTER TABLE "services" ADD CONSTRAINT "services_downtime_range_check"
  CHECK ("downtimeEnd" IS NULL OR "downtimeStart" IS NULL OR "downtimeEnd" >= "downtimeStart");

ALTER TABLE "rental_pauses" ADD CONSTRAINT "rental_pauses_resume_range_check"
  CHECK ("resumedAt" IS NULL OR "resumedAt" >= "pausedAt");

ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_return_range_check"
  CHECK ("returnedAt" IS NULL OR "returnedAt" >= "assignedAt");

ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_non_negative_check"
  CHECK ("costAmount" >= 0 AND "billableAmount" >= 0);

ALTER TABLE "spares" ADD CONSTRAINT "spares_non_negative_check"
  CHECK ("unitCost" >= 0 AND ("purchasePrice" IS NULL OR "purchasePrice" >= 0) AND "minimumStock" >= 0);

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_quantity_check"
  CHECK ("quantity" > 0 AND "quantityDelta" <> 0);

-- ============================================================
-- FOREIGN KEYS
-- ============================================================
ALTER TABLE "services" ADD CONSTRAINT "services_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_serviceSpareId_fkey" FOREIGN KEY ("serviceSpareId") REFERENCES "service_spares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_responsibility_approvals" ADD CONSTRAINT "service_responsibility_approvals_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_responsibility_approvals" ADD CONSTRAINT "service_responsibility_approvals_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rental_pauses" ADD CONSTRAINT "rental_pauses_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rental_pauses" ADD CONSTRAINT "rental_pauses_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rental_pauses" ADD CONSTRAINT "rental_pauses_pausedById_fkey" FOREIGN KEY ("pausedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rental_pauses" ADD CONSTRAINT "rental_pauses_resumedById_fkey" FOREIGN KEY ("resumedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_originalVehicleId_fkey" FOREIGN KEY ("originalVehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_replacementVehicleId_fkey" FOREIGN KEY ("replacementVehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_replacementRentalId_fkey" FOREIGN KEY ("replacementRentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
