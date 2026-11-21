-- Match commit 41d1195: drop removed Vehicle/RateCard fields, make Rider.rentalType required.

ALTER TABLE "rate_cards" DROP COLUMN "effectiveFrom";
ALTER TABLE "rate_cards" DROP COLUMN "effectiveTo";

ALTER TABLE "vehicles" DROP COLUMN "seats";
ALTER TABLE "vehicles" DROP COLUMN "bootSpace";
ALTER TABLE "vehicles" DROP COLUMN "safeCabCertificateExpiryDate";

ALTER TABLE "riders" ALTER COLUMN "rentalType" SET NOT NULL;
