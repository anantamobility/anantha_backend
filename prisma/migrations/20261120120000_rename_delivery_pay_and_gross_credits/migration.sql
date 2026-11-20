-- Rename "earning" terminology: ledger entry types and pay statement column.

ALTER TYPE "LedgerEntryType" RENAME VALUE 'DELIVERY_EARNING' TO 'DELIVERY_PAY';
ALTER TYPE "PayStatementLineType" RENAME VALUE 'DELIVERY_EARNING' TO 'DELIVERY_PAY';

ALTER TABLE "rider_pay_statements" RENAME COLUMN "grossEarnings" TO "grossCredits";
