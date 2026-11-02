-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'CORPORATE');

-- CreateEnum
CREATE TYPE "RentalType" AS ENUM ('B2C', 'B2B');

-- CreateEnum
CREATE TYPE "B2CMode" AS ENUM ('AML_RIDER', 'INDIVIDUAL_RIDER');

-- CreateEnum
CREATE TYPE "B2BRiderMgmt" AS ENUM ('CLIENT_MANAGED', 'AML_MANAGED');

-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'TERMINATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TRANSFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('IDLE', 'DEPLOYED', 'IN_SERVICE', 'UNDER_REPAIR', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RiderStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DepositPayerType" AS ENUM ('CLIENT', 'RIDER');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('REQUIRED', 'PENDING_RECEIPT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FORFEITED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DepositTransactionType" AS ENUM ('RECEIPT', 'REFUND', 'DEDUCTION', 'FORFEIT', 'ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('CONSOLIDATED', 'RENTAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('RENTAL', 'SERVICE', 'REPAIR', 'REPLACEMENT', 'PARTS', 'DOWNTIME', 'ADJUSTMENT', 'CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "CollectionPayerType" AS ENUM ('CLIENT', 'RIDER');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('PENDING', 'CLEARED', 'FAILED', 'REFUNDED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "PayoutRecipientType" AS ENUM ('RIDER', 'STAFF', 'VENDOR', 'CLIENT');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID', 'FAILED', 'RECONCILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "SettlementLineType" AS ENUM ('DELIVERY_EARNING', 'RENT_DEDUCTION', 'DEPOSIT_DEDUCTION', 'ADJUSTMENT', 'OTHER_DEDUCTION', 'PAYOUT_REVERSAL');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('DELIVERY_EARNING', 'RENT_DEDUCTION', 'DEPOSIT_DEDUCTION', 'ADJUSTMENT', 'PAYOUT', 'REVERSAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('TECHNICAL', 'PREVENTIVE', 'ACCIDENT', 'RIDER_DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('REPORTED', 'APPROVED', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResponsibleParty" AS ENUM ('AML', 'RIDER', 'CLIENT', 'THIRD_PARTY', 'INSURANCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ServiceChargeType" AS ENUM ('LABOR', 'SPARE_PARTS', 'OTHER_COST', 'DOWNTIME_RENT', 'REPLACEMENT_RENT');

-- CreateEnum
CREATE TYPE "ServiceChargeStatus" AS ENUM ('PENDING', 'BILLED', 'WAIVED', 'COLLECTED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE', 'RETURN', 'ADJUSTMENT', 'ISSUE_TO_SERVICE', 'TRANSFER', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ID_PROOF', 'ADDRESS_PROOF', 'DRIVING_LICENSE', 'VEHICLE_PERMIT', 'INSURANCE', 'REGISTRATION', 'CONTRACT', 'PVC', 'BGV', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VerificationType" AS ENUM ('PVC', 'BGV');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ONBOARDING',
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "roleId" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "employeeCode" TEXT,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "hubId" TEXT,
    "jobTitle" TEXT,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riders" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "riderCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneNumber" TEXT,
    "hubId" TEXT,
    "status" "RiderStatus" NOT NULL DEFAULT 'ONBOARDING',
    "onboardedAt" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hubs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" JSONB,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hubs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "registrationNumber" VARCHAR(15) NOT NULL,
    "hubId" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "color" TEXT,
    "vin" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'IDLE',
    "acquiredAt" TIMESTAMPTZ(3),
    "retiredAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_hub_history" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "fromDate" TIMESTAMPTZ(3) NOT NULL,
    "toDate" TIMESTAMPTZ(3),
    "changedById" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_hub_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "type" "ClientType" NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phoneNumber" TEXT,
    "taxId" TEXT,
    "billingAddress" JSONB,
    "paymentTermsDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_users" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientId" TEXT,
    "rentalType" "RentalType",
    "billingFrequency" "BillingFrequency",
    "dailyRate" DECIMAL(14,4) NOT NULL,
    "weeklyRate" DECIMAL(14,4),
    "fortnightlyRate" DECIMAL(14,4),
    "monthlyRate" DECIMAL(14,4),
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "effectiveFrom" TIMESTAMPTZ(3) NOT NULL,
    "effectiveTo" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "terms" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentals" (
    "id" TEXT NOT NULL,
    "rentalType" "RentalType" NOT NULL,
    "b2cMode" "B2CMode",
    "b2bRiderMgmt" "B2BRiderMgmt",
    "clientId" TEXT NOT NULL,
    "riderId" TEXT,
    "hubId" TEXT,
    "rateCardId" TEXT,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3),
    "expectedEndDate" TIMESTAMPTZ(3),
    "status" "RentalStatus" NOT NULL DEFAULT 'DRAFT',
    "agreementRef" TEXT,
    "billingFrequency" "BillingFrequency",
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "dailyRate" DECIMAL(14,4),
    "weeklyRate" DECIMAL(14,4),
    "fortnightlyRate" DECIMAL(14,4),
    "monthlyRate" DECIMAL(14,4),
    "securityDepositRequired" DECIMAL(14,2),
    "rateSnapshot" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_assignments" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "riderId" TEXT,
    "rentalId" TEXT,
    "hubId" TEXT,
    "assignedById" TEXT,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "replacementForId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_status_history" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "status" "VehicleStatus" NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_status_history" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "status" "RiderStatus" NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "payerType" "DepositPayerType" NOT NULL,
    "clientId" TEXT,
    "riderId" TEXT,
    "rentalId" TEXT,
    "amountRequired" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "DepositStatus" NOT NULL DEFAULT 'REQUIRED',
    "dueDate" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_transactions" (
    "id" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "type" "DepositTransactionType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "reference" TEXT,
    "reason" TEXT,
    "authorizedById" TEXT,
    "collectionId" TEXT,
    "reversesTransactionId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "kind" "InvoiceKind" NOT NULL DEFAULT 'CONSOLIDATED',
    "clientId" TEXT NOT NULL,
    "rentalId" TEXT,
    "billingPeriodStart" TIMESTAMPTZ(3) NOT NULL,
    "billingPeriodEnd" TIMESTAMPTZ(3) NOT NULL,
    "billingFrequency" "BillingFrequency" NOT NULL,
    "issueDate" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedAt" TIMESTAMPTZ(3),
    "dueDate" TIMESTAMPTZ(3) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "voidedById" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "rentalId" TEXT,
    "serviceChargeId" TEXT,
    "chargeType" "ChargeType" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,3),
    "unitPrice" DECIMAL(14,4),
    "lineAmount" DECIMAL(14,2) NOT NULL,
    "periodStart" TIMESTAMPTZ(3),
    "periodEnd" TIMESTAMPTZ(3),
    "pricingSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "payerType" "CollectionPayerType" NOT NULL,
    "clientId" TEXT,
    "riderId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "referenceNumber" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "CollectionStatus" NOT NULL DEFAULT 'PENDING',
    "receivedById" TEXT,
    "reconciledAt" TIMESTAMPTZ(3),
    "reconciledById" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_settlements" (
    "id" TEXT NOT NULL,
    "settlementNumber" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "grossEarnings" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "calculationSnapshot" JSONB,
    "version" INTEGER NOT NULL DEFAULT 0,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_settlement_lines" (
    "id" TEXT NOT NULL,
    "settlementId" TEXT NOT NULL,
    "lineType" "SettlementLineType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "rentalId" TEXT,
    "ledgerEntryId" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings_ledger" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "settlementId" TEXT,
    "rentalId" TEXT,
    "reversesEntryId" TEXT,
    "createdById" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earnings_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "recipientType" "PayoutRecipientType" NOT NULL,
    "riderId" TEXT,
    "staffId" TEXT,
    "vendorId" TEXT,
    "clientId" TEXT,
    "settlementId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "paymentMethod" "PaymentMethod",
    "referenceNumber" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactPerson" TEXT,
    "phoneNumber" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "rentalId" TEXT,
    "serviceType" "ServiceType" NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'REPORTED',
    "responsibleParty" "ResponsibleParty" NOT NULL DEFAULT 'UNKNOWN',
    "reportedById" TEXT,
    "approvedById" TEXT,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "downtimeStart" TIMESTAMPTZ(3),
    "downtimeEnd" TIMESTAMPTZ(3),
    "description" TEXT,
    "resolutionNotes" TEXT,
    "replacementVehicleId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_charges" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "chargeType" "ServiceChargeType" NOT NULL,
    "costAmount" DECIMAL(14,2) NOT NULL,
    "billableAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "recoverableFrom" "ResponsibleParty" NOT NULL DEFAULT 'AML',
    "status" "ServiceChargeStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_status_history" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "status" "ServiceStatus" NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_spares" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "spareId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "lineCost" DECIMAL(14,2) NOT NULL,
    "inventoryMovementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_spares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spares" (
    "id" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitCost" DECIMAL(14,4) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" TEXT NOT NULL,
    "spareId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "spareId" TEXT NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,4),
    "fromHubId" TEXT,
    "toHubId" TEXT,
    "serviceId" TEXT,
    "vehicleId" TEXT,
    "movedById" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "movedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "storageKey" TEXT NOT NULL,
    "storageBucket" TEXT,
    "issueDate" TIMESTAMPTZ(3),
    "expiryDate" TIMESTAMPTZ(3),
    "riderId" TEXT,
    "staffId" TEXT,
    "vehicleId" TEXT,
    "clientId" TEXT,
    "userId" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMPTZ(3),
    "uploadedById" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_verifications" (
    "id" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "type" "VerificationType" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "verifiedById" TEXT,
    "rejectionReason" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rider_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "changes" JSONB,
    "summary" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_PermissionToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PermissionToRole_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_resource_action_key" ON "permissions"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_userId_key" ON "staff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_employeeCode_key" ON "staff"("employeeCode");

-- CreateIndex
CREATE INDEX "staff_hubId_idx" ON "staff"("hubId");

-- CreateIndex
CREATE UNIQUE INDEX "riders_userId_key" ON "riders"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "riders_riderCode_key" ON "riders"("riderCode");

-- CreateIndex
CREATE INDEX "riders_hubId_idx" ON "riders"("hubId");

-- CreateIndex
CREATE INDEX "riders_status_idx" ON "riders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "hubs_name_key" ON "hubs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "hubs_code_key" ON "hubs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_registrationNumber_key" ON "vehicles"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE INDEX "vehicles_hubId_idx" ON "vehicles"("hubId");

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE INDEX "vehicle_hub_history_vehicleId_fromDate_idx" ON "vehicle_hub_history"("vehicleId", "fromDate");

-- CreateIndex
CREATE INDEX "vehicle_hub_history_hubId_idx" ON "vehicle_hub_history"("hubId");

-- CreateIndex
CREATE INDEX "clients_type_idx" ON "clients"("type");

-- CreateIndex
CREATE INDEX "clients_phoneNumber_idx" ON "clients"("phoneNumber");

-- CreateIndex
CREATE INDEX "clients_email_idx" ON "clients"("email");

-- CreateIndex
CREATE INDEX "client_users_userId_idx" ON "client_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "client_users_clientId_userId_key" ON "client_users"("clientId", "userId");

-- CreateIndex
CREATE INDEX "rate_cards_clientId_effectiveFrom_idx" ON "rate_cards"("clientId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "rate_cards_rentalType_billingFrequency_idx" ON "rate_cards"("rentalType", "billingFrequency");

-- CreateIndex
CREATE INDEX "rentals_clientId_status_idx" ON "rentals"("clientId", "status");

-- CreateIndex
CREATE INDEX "rentals_riderId_status_idx" ON "rentals"("riderId", "status");

-- CreateIndex
CREATE INDEX "rentals_hubId_idx" ON "rentals"("hubId");

-- CreateIndex
CREATE INDEX "rentals_startDate_endDate_idx" ON "rentals"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "vehicle_assignments_vehicleId_status_idx" ON "vehicle_assignments"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "vehicle_assignments_riderId_status_idx" ON "vehicle_assignments"("riderId", "status");

-- CreateIndex
CREATE INDEX "vehicle_assignments_rentalId_status_idx" ON "vehicle_assignments"("rentalId", "status");

-- CreateIndex
CREATE INDEX "vehicle_assignments_hubId_idx" ON "vehicle_assignments"("hubId");

-- CreateIndex
CREATE INDEX "vehicle_status_history_vehicleId_changedAt_idx" ON "vehicle_status_history"("vehicleId", "changedAt");

-- CreateIndex
CREATE INDEX "rider_status_history_riderId_changedAt_idx" ON "rider_status_history"("riderId", "changedAt");

-- CreateIndex
CREATE INDEX "deposits_clientId_idx" ON "deposits"("clientId");

-- CreateIndex
CREATE INDEX "deposits_riderId_idx" ON "deposits"("riderId");

-- CreateIndex
CREATE INDEX "deposits_rentalId_idx" ON "deposits"("rentalId");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_transactions_reversesTransactionId_key" ON "deposit_transactions"("reversesTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_transactions_idempotencyKey_key" ON "deposit_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "deposit_transactions_depositId_createdAt_idx" ON "deposit_transactions"("depositId", "createdAt");

-- CreateIndex
CREATE INDEX "deposit_transactions_collectionId_idx" ON "deposit_transactions"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- CreateIndex
CREATE INDEX "invoices_clientId_status_dueDate_idx" ON "invoices"("clientId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "invoices_rentalId_idx" ON "invoices"("rentalId");

-- CreateIndex
CREATE INDEX "invoices_issueDate_idx" ON "invoices"("issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_serviceChargeId_key" ON "invoice_lines"("serviceChargeId");

-- CreateIndex
CREATE INDEX "invoice_lines_invoiceId_idx" ON "invoice_lines"("invoiceId");

-- CreateIndex
CREATE INDEX "invoice_lines_rentalId_idx" ON "invoice_lines"("rentalId");

-- CreateIndex
CREATE UNIQUE INDEX "collections_idempotencyKey_key" ON "collections"("idempotencyKey");

-- CreateIndex
CREATE INDEX "collections_clientId_receivedAt_idx" ON "collections"("clientId", "receivedAt");

-- CreateIndex
CREATE INDEX "collections_riderId_receivedAt_idx" ON "collections"("riderId", "receivedAt");

-- CreateIndex
CREATE INDEX "collections_status_idx" ON "collections"("status");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_collectionId_invoiceId_key" ON "payment_allocations"("collectionId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "rider_settlements_settlementNumber_key" ON "rider_settlements"("settlementNumber");

-- CreateIndex
CREATE INDEX "rider_settlements_riderId_periodStart_periodEnd_idx" ON "rider_settlements"("riderId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "rider_settlements_status_idx" ON "rider_settlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rider_settlement_lines_ledgerEntryId_key" ON "rider_settlement_lines"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "rider_settlement_lines_settlementId_idx" ON "rider_settlement_lines"("settlementId");

-- CreateIndex
CREATE INDEX "rider_settlement_lines_rentalId_idx" ON "rider_settlement_lines"("rentalId");

-- CreateIndex
CREATE INDEX "rider_settlement_lines_ledgerEntryId_idx" ON "rider_settlement_lines"("ledgerEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_ledger_reversesEntryId_key" ON "earnings_ledger"("reversesEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_ledger_idempotencyKey_key" ON "earnings_ledger"("idempotencyKey");

-- CreateIndex
CREATE INDEX "earnings_ledger_riderId_occurredAt_idx" ON "earnings_ledger"("riderId", "occurredAt");

-- CreateIndex
CREATE INDEX "earnings_ledger_settlementId_idx" ON "earnings_ledger"("settlementId");

-- CreateIndex
CREATE INDEX "earnings_ledger_rentalId_idx" ON "earnings_ledger"("rentalId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_idempotencyKey_key" ON "payouts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payouts_riderId_status_idx" ON "payouts"("riderId", "status");

-- CreateIndex
CREATE INDEX "payouts_staffId_idx" ON "payouts"("staffId");

-- CreateIndex
CREATE INDEX "payouts_vendorId_idx" ON "payouts"("vendorId");

-- CreateIndex
CREATE INDEX "payouts_clientId_idx" ON "payouts"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_name_key" ON "vendors"("name");

-- CreateIndex
CREATE INDEX "services_vehicleId_status_idx" ON "services"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "services_rentalId_idx" ON "services"("rentalId");

-- CreateIndex
CREATE INDEX "services_reportedAt_idx" ON "services"("reportedAt");

-- CreateIndex
CREATE INDEX "services_replacementVehicleId_idx" ON "services"("replacementVehicleId");

-- CreateIndex
CREATE INDEX "service_charges_serviceId_idx" ON "service_charges"("serviceId");

-- CreateIndex
CREATE INDEX "service_status_history_serviceId_changedAt_idx" ON "service_status_history"("serviceId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX "service_spares_inventoryMovementId_key" ON "service_spares"("inventoryMovementId");

-- CreateIndex
CREATE INDEX "service_spares_serviceId_idx" ON "service_spares"("serviceId");

-- CreateIndex
CREATE INDEX "service_spares_spareId_idx" ON "service_spares"("spareId");

-- CreateIndex
CREATE UNIQUE INDEX "spares_partNumber_key" ON "spares"("partNumber");

-- CreateIndex
CREATE INDEX "inventory_balances_hubId_idx" ON "inventory_balances"("hubId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balances_spareId_hubId_key" ON "inventory_balances"("spareId", "hubId");

-- CreateIndex
CREATE INDEX "inventory_movements_spareId_movedAt_idx" ON "inventory_movements"("spareId", "movedAt");

-- CreateIndex
CREATE INDEX "inventory_movements_fromHubId_idx" ON "inventory_movements"("fromHubId");

-- CreateIndex
CREATE INDEX "inventory_movements_toHubId_idx" ON "inventory_movements"("toHubId");

-- CreateIndex
CREATE INDEX "inventory_movements_serviceId_idx" ON "inventory_movements"("serviceId");

-- CreateIndex
CREATE INDEX "inventory_movements_vehicleId_idx" ON "inventory_movements"("vehicleId");

-- CreateIndex
CREATE INDEX "documents_riderId_idx" ON "documents"("riderId");

-- CreateIndex
CREATE INDEX "documents_staffId_idx" ON "documents"("staffId");

-- CreateIndex
CREATE INDEX "documents_vehicleId_idx" ON "documents"("vehicleId");

-- CreateIndex
CREATE INDEX "documents_clientId_idx" ON "documents"("clientId");

-- CreateIndex
CREATE INDEX "documents_userId_idx" ON "documents"("userId");

-- CreateIndex
CREATE INDEX "documents_documentType_idx" ON "documents"("documentType");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_expiryDate_idx" ON "documents"("expiryDate");

-- CreateIndex
CREATE INDEX "rider_verifications_riderId_type_status_idx" ON "rider_verifications"("riderId", "type", "status");

-- CreateIndex
CREATE INDEX "rider_verifications_expiresAt_idx" ON "rider_verifications"("expiresAt");

-- CreateIndex
CREATE INDEX "rider_verifications_documentId_idx" ON "rider_verifications"("documentId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_resourceId_idx" ON "audit_logs"("resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");

-- CreateIndex
CREATE INDEX "_PermissionToRole_B_index" ON "_PermissionToRole"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_hub_history" ADD CONSTRAINT "vehicle_hub_history_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_hub_history" ADD CONSTRAINT "vehicle_hub_history_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_hub_history" ADD CONSTRAINT "vehicle_hub_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_users" ADD CONSTRAINT "client_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "rate_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_replacementForId_fkey" FOREIGN KEY ("replacementForId") REFERENCES "vehicle_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_status_history" ADD CONSTRAINT "vehicle_status_history_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_status_history" ADD CONSTRAINT "vehicle_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_status_history" ADD CONSTRAINT "rider_status_history_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_status_history" ADD CONSTRAINT "rider_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_reversesTransactionId_fkey" FOREIGN KEY ("reversesTransactionId") REFERENCES "deposit_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_serviceChargeId_fkey" FOREIGN KEY ("serviceChargeId") REFERENCES "service_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_reconciledById_fkey" FOREIGN KEY ("reconciledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_settlements" ADD CONSTRAINT "rider_settlements_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_settlements" ADD CONSTRAINT "rider_settlements_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_settlement_lines" ADD CONSTRAINT "rider_settlement_lines_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "rider_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_settlement_lines" ADD CONSTRAINT "rider_settlement_lines_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_settlement_lines" ADD CONSTRAINT "rider_settlement_lines_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "earnings_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "rider_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "earnings_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "rider_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_replacementVehicleId_fkey" FOREIGN KEY ("replacementVehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_status_history" ADD CONSTRAINT "service_status_history_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_status_history" ADD CONSTRAINT "service_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_spares" ADD CONSTRAINT "service_spares_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_spares" ADD CONSTRAINT "service_spares_spareId_fkey" FOREIGN KEY ("spareId") REFERENCES "spares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_spares" ADD CONSTRAINT "service_spares_inventoryMovementId_fkey" FOREIGN KEY ("inventoryMovementId") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_spareId_fkey" FOREIGN KEY ("spareId") REFERENCES "spares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_spareId_fkey" FOREIGN KEY ("spareId") REFERENCES "spares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_fromHubId_fkey" FOREIGN KEY ("fromHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_toHubId_fkey" FOREIGN KEY ("toHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_verifications" ADD CONSTRAINT "rider_verifications_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_verifications" ADD CONSTRAINT "rider_verifications_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_verifications" ADD CONSTRAINT "rider_verifications_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Domain integrity constraints (Prisma cannot express these)
-- ============================================================

-- Date ordering
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_date_order_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_date_order_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "rider_settlements" ADD CONSTRAINT "rider_settlements_period_order_check" CHECK ("periodEnd" >= "periodStart");
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_effective_order_check" CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
ALTER TABLE "services" ADD CONSTRAINT "services_downtime_order_check" CHECK ("downtimeEnd" IS NULL OR "downtimeEnd" >= "downtimeStart");
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_due_date_check" CHECK ("dueDate" >= "issueDate");

-- Required values
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_amount_required_check" CHECK ("amountRequired" > 0);
ALTER TABLE "earnings_ledger" ADD CONSTRAINT "earnings_ledger_amount_check" CHECK ("amount" > 0);
ALTER TABLE "rider_settlement_lines" ADD CONSTRAINT "rider_settlement_lines_amount_check" CHECK ("amount" > 0);

-- Billing mode integrity
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_billing_mode_check" CHECK (
  ("rentalType" = 'B2B' AND "billingFrequency" IS NOT NULL)
  OR ("rentalType" = 'B2C')
);

-- Invoice kind integrity
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_kind_check" CHECK (
  ("kind" = 'RENTAL' AND "rentalId" IS NOT NULL)
  OR ("kind" = 'CONSOLIDATED' AND "rentalId" IS NULL)
);

-- One paid payout per settlement (multiple attempts allowed)
CREATE UNIQUE INDEX "payouts_one_paid_per_settlement"
  ON "payouts" ("settlementId")
  WHERE ("status" = 'PAID' AND "settlementId" IS NOT NULL);

-- Payer/recipient integrity
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_payer_check" CHECK (
  ("payerType" = 'CLIENT' AND "clientId" IS NOT NULL AND "riderId" IS NULL)
  OR ("payerType" = 'RIDER' AND "riderId" IS NOT NULL AND "clientId" IS NULL)
);
ALTER TABLE "collections" ADD CONSTRAINT "collections_payer_check" CHECK (
  ("payerType" = 'CLIENT' AND "clientId" IS NOT NULL AND "riderId" IS NULL)
  OR ("payerType" = 'RIDER' AND "riderId" IS NOT NULL AND "clientId" IS NULL)
);
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_recipient_check" CHECK (
  ("recipientType" = 'RIDER' AND "riderId" IS NOT NULL AND "staffId" IS NULL AND "vendorId" IS NULL AND "clientId" IS NULL)
  OR ("recipientType" = 'STAFF' AND "staffId" IS NOT NULL AND "riderId" IS NULL AND "vendorId" IS NULL AND "clientId" IS NULL)
  OR ("recipientType" = 'VENDOR' AND "vendorId" IS NOT NULL AND "riderId" IS NULL AND "staffId" IS NULL AND "clientId" IS NULL)
  OR ("recipientType" = 'CLIENT' AND "clientId" IS NOT NULL AND "riderId" IS NULL AND "staffId" IS NULL AND "vendorId" IS NULL)
);

-- Inventory integrity
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_non_negative_check" CHECK ("onHand" >= 0 AND "reserved" >= 0 AND "reserved" <= "onHand");

-- One open settlement per rider
CREATE UNIQUE INDEX "rider_settlements_one_open_per_rider"
  ON "rider_settlements" ("riderId")
  WHERE ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED'));

-- Vehicle assignment exclusion (requires btree_gist)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "vehicle_assignments" ADD CONSTRAINT "vehicle_assignments_no_overlap"
  EXCLUDE USING gist (
    "vehicleId" WITH =,
    tstzrange("startDate", COALESCE("endDate", 'infinity'::timestamptz), '[)') WITH &&
  )
  WHERE ("status" = 'ACTIVE');
