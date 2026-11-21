-- Collections are final when recorded. Drop the separate reconciliation step.

ALTER TABLE "collections" DROP COLUMN "reconciledAt";
ALTER TABLE "collections" DROP COLUMN "reconciledById";
