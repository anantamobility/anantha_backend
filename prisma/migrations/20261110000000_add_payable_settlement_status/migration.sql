-- Add the PAYABLE state used when a rider settlement is ready to be paid.
-- PostgreSQL requires enum additions to run outside a transaction that also
-- uses the new value, so this is intentionally a standalone migration.
ALTER TYPE "SettlementStatus" ADD VALUE 'PAYABLE';
