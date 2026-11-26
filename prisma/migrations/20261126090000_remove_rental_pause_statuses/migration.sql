-- A rental never pauses. Rentals are created ACTIVE, so DRAFT,
-- PENDING_APPROVAL and ON_HOLD are removed from RentalStatus.

-- Any legacy row in a removed state becomes ACTIVE, which is how the
-- application would have treated it anyway.
UPDATE "rentals"
SET "status" = 'ACTIVE'
WHERE "status"::text IN ('DRAFT', 'PENDING_APPROVAL', 'ON_HOLD');

ALTER TYPE "RentalStatus" RENAME TO "RentalStatus_old";
CREATE TYPE "RentalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TERMINATED', 'CANCELLED');

-- Drop the old DRAFT default before the cast, restore it as ACTIVE after.
ALTER TABLE "rentals" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "rentals" ALTER COLUMN "status" TYPE "RentalStatus" USING ("status"::text::"RentalStatus");
ALTER TABLE "rentals" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

DROP TYPE "RentalStatus_old";
