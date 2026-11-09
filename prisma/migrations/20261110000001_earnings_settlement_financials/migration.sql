-- Rider settlement shortfall tracking and manual-review flag.
ALTER TABLE "rider_settlements"
  ADD COLUMN "shortfallAmount" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN "requiresManualReview" BOOLEAN NOT NULL DEFAULT false;

-- Daily (and other per-period) settlements are allowed, so the old
-- one-open-settlement-per-rider rule is replaced with a per-period rule.
DROP INDEX IF EXISTS "rider_settlements_one_open_per_rider";

CREATE UNIQUE INDEX "rider_settlements_one_open_per_period"
  ON "rider_settlements" ("riderId", "periodStart", "periodEnd")
  WHERE ("status" NOT IN ('REVERSED', 'FAILED'));

CREATE INDEX "payouts_settlementId_idx" ON "payouts"("settlementId");
