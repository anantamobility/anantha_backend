-- Client tax id, billing address and payment terms are not part of the basic model.

ALTER TABLE "clients" DROP COLUMN "taxId";
ALTER TABLE "clients" DROP COLUMN "billingAddress";
ALTER TABLE "clients" DROP COLUMN "paymentTermsDays";
