-- Clients are B2B companies. Drop the redundant individual/corporate flag.

DROP INDEX "clients_type_idx";
ALTER TABLE "clients" DROP COLUMN "type";
DROP TYPE "ClientType";
