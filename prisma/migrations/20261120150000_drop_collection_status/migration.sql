-- A collection row means money was received. Drop the unused status.

ALTER TABLE "collections" DROP COLUMN "status";
DROP TYPE "CollectionStatus";
