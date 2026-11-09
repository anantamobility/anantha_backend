-- Day 11: B2B clients and ratecards.
--
-- Both unique business identifiers are added nullable, backfilled from the
-- existing primary key, then made NOT NULL. This keeps the migration safe for
-- databases that already contain clients or ratecards.

-- AlterTable: Client
ALTER TABLE "clients" ADD COLUMN "clientCode" TEXT;
UPDATE "clients"
SET "clientCode" = 'CLI-' || upper(replace("id", '-', ''))
WHERE "clientCode" IS NULL;
ALTER TABLE "clients" ALTER COLUMN "clientCode" SET NOT NULL;
CREATE UNIQUE INDEX "clients_clientCode_key" ON "clients"("clientCode");
CREATE INDEX "clients_isActive_idx" ON "clients"("isActive");
CREATE INDEX "clients_deletedAt_idx" ON "clients"("deletedAt");

-- AlterTable: RateCard
ALTER TABLE "rate_cards" ADD COLUMN "code" TEXT;
UPDATE "rate_cards"
SET "code" = 'RC-' || upper(replace("id", '-', ''))
WHERE "code" IS NULL;
ALTER TABLE "rate_cards" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "rate_cards_code_key" ON "rate_cards"("code");
ALTER TABLE "rate_cards" ADD COLUMN "description" TEXT;
ALTER TABLE "rate_cards" ADD COLUMN "securityDeposit" DECIMAL(14,2);
CREATE INDEX "rate_cards_clientId_isActive_effectiveFrom_idx"
  ON "rate_cards"("clientId", "isActive", "effectiveFrom");
CREATE INDEX "rate_cards_isActive_idx" ON "rate_cards"("isActive");
