-- Drop optimistic-lock and idempotency columns.
-- Duplicate protection now lives in request middleware, not in these tables.

ALTER TABLE "riders" DROP COLUMN "version";
ALTER TABLE "vehicles" DROP COLUMN "version";
ALTER TABLE "rentals" DROP COLUMN "version";
ALTER TABLE "deposits" DROP COLUMN "version";
ALTER TABLE "rider_pay_statements" DROP COLUMN "version";
ALTER TABLE "invoices" DROP COLUMN "version";
ALTER TABLE "services" DROP COLUMN "version";

ALTER TABLE "deposit_ledger_entries" DROP COLUMN "idempotencyKey";
ALTER TABLE "collections" DROP COLUMN "idempotencyKey";
ALTER TABLE "ledger_entries" DROP COLUMN "idempotencyKey";
ALTER TABLE "service_charges" DROP COLUMN "idempotencyKey";
ALTER TABLE "service_spares" DROP COLUMN "idempotencyKey";
ALTER TABLE "inventory_movements" DROP COLUMN "idempotencyKey";
