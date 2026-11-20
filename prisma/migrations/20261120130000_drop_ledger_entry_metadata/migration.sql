-- Ledger entries keep provenance in sourceType/sourceId. Drop the free-form JSON bag.

ALTER TABLE "ledger_entries" DROP COLUMN "metadata";
