-- Set the default for newly created verification rows after NOT_SUBMITTED was
-- added to the enum in the previous migration.
ALTER TABLE "rider_verifications" ALTER COLUMN "status" SET DEFAULT 'NOT_SUBMITTED';
