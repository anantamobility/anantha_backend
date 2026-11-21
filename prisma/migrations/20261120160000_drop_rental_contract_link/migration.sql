-- ClientContract is dormant and belongs only to a client. Remove its rental link.

ALTER TABLE "rentals" DROP CONSTRAINT "rentals_contractId_fkey";
DROP INDEX "rentals_contractId_idx";
ALTER TABLE "rentals" DROP COLUMN "contractId";
