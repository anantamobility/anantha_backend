-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY');

-- CreateEnum
CREATE TYPE "RentalType" AS ENUM ('B2C', 'B2B');

-- CreateEnum
CREATE TYPE "B2CMode" AS ENUM ('AML_RIDER', 'INDIVIDUAL_RIDER');

-- CreateEnum
CREATE TYPE "B2BRiderMgmt" AS ENUM ('CLIENT_MANAGED', 'AML_MANAGED');

-- CreateEnum
CREATE TYPE "BillingFrequency" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "CollectionPeriod" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "RentalDueStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TERMINATED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'TRANSFERRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VehicleStatus" AS ENUM ('IDLE', 'DEPLOYED', 'IN_SERVICE', 'UNDER_REPAIR', 'OUT_OF_SERVICE', 'RETIRED');

-- CreateEnum
CREATE TYPE "RiderStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('INTERN', 'TRAINEE', 'FULL_TIME', 'PART_TIME', 'CONSULTANT');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('REMOTE', 'ONSITE', 'HYBRID');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "DepositPayerType" AS ENUM ('CLIENT', 'RIDER');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('REQUIRED', 'PENDING_RECEIPT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FORFEITED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DepositEntryType" AS ENUM ('RECEIPT', 'REFUND', 'DEDUCTION', 'FORFEIT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('CONSOLIDATED', 'RENTAL');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('RENTAL', 'SERVICE', 'REPAIR', 'REPLACEMENT', 'PARTS', 'DOWNTIME', 'ADJUSTMENT', 'CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "CollectionPayerType" AS ENUM ('CLIENT', 'RIDER');

-- CreateEnum
CREATE TYPE "CollectionPurpose" AS ENUM ('RENT', 'DEPOSIT');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "PayStatementStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'PAYABLE', 'APPROVED', 'PAID', 'FAILED', 'RECONCILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "PayStatementLineType" AS ENUM ('DELIVERY_PAY', 'RENT_DEDUCTION', 'DEPOSIT_DEDUCTION', 'OTHER_DEDUCTION', 'PAYOUT_REVERSAL', 'INCENTIVE', 'REIMBURSEMENT', 'ADVANCE', 'ADVANCE_RECOVERY');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('RENT_CHARGED', 'COLLECTION_RECEIVED', 'DELIVERY_PAY', 'RENT_DEDUCTION', 'DEPOSIT_DEDUCTION', 'PAYOUT', 'REVERSAL', 'OTHER', 'INCENTIVE', 'REIMBURSEMENT', 'ADVANCE', 'ADVANCE_RECOVERY');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('TECHNICAL', 'PREVENTIVE', 'ACCIDENT', 'RIDER_DAMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('REPORTED', 'APPROVED', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ResponsibleParty" AS ENUM ('AML', 'RIDER', 'CLIENT', 'THIRD_PARTY', 'INSURANCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ServiceChargeType" AS ENUM ('LABOR', 'SPARE_PARTS', 'OTHER_COST', 'DOWNTIME_RENT', 'REPLACEMENT_RENT');

-- CreateEnum
CREATE TYPE "ServiceChargeStatus" AS ENUM ('PENDING', 'BILLED', 'WAIVED', 'COLLECTED');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('PURCHASE', 'RETURN', 'ADJUSTMENT', 'ISSUE_TO_SERVICE', 'TRANSFER', 'WRITE_OFF', 'OPENING_STOCK', 'PURCHASE_IN', 'SERVICE_CONSUMPTION', 'MANUAL_ADJUSTMENT', 'SERVICE_RETURN', 'DAMAGED_STOCK');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ID_PROOF', 'PAN', 'AADHAAR', 'ADDRESS_PROOF', 'DRIVING_LICENSE', 'VEHICLE_PERMIT', 'INSURANCE', 'REGISTRATION', 'CONTRACT', 'PVC', 'BGV', 'OTHER');

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
    "email" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ONBOARDING',
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "roleId" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employeeCode" TEXT,
    "fullName" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "dateOfBirth" DATE,
    "department" TEXT,
    "alternatePhone" TEXT,
    "address" JSONB,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "bloodGroup" TEXT,
    "employmentType" "EmploymentType",
    "workMode" "WorkMode",
    "educationalQualification" TEXT,
    "anniversary" DATE,
    "dateOfJoining" TIMESTAMPTZ(3),
    "probationEndDate" TIMESTAMPTZ(3),
    "dateOfLastWorkingDay" TIMESTAMPTZ(3),
    "dateOfRelieving" TIMESTAMPTZ(3),
    "aadharNumber" TEXT,
    "panNumber" TEXT,
    "bankName" TEXT,
    "branch" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "bankHolderName" TEXT,
    "hubId" TEXT,
    "jobTitle" TEXT,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusChangedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "riders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "riderCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "gender" "Gender",
    "address" JSONB,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "aadharNumber" TEXT,
    "panNumber" TEXT,
    "licenseNumber" TEXT,
    "medicalReportExpiryDate" TIMESTAMPTZ(3),
    "agreementDate" TIMESTAMPTZ(3),
    "policeVerificationValidUpto" TIMESTAMPTZ(3),
    "backgroundVerificationExpiryDate" TIMESTAMPTZ(3),
    "dateOfLastWorkingDay" TIMESTAMPTZ(3),
    "deliveryPartnerCode" TEXT,
    "bankName" TEXT,
    "branch" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "bankHolderName" TEXT,
    "rentalType" "RentalType" NOT NULL,
    "b2cMode" "B2CMode",
    "b2bRiderMgmt" "B2BRiderMgmt",
    "clientId" TEXT,
    "hubId" TEXT,
    "status" "RiderStatus" NOT NULL DEFAULT 'ONBOARDING',
    "onboardedAt" TIMESTAMPTZ(3),
    "statusChangedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "riders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hubs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "hubCode" TEXT NOT NULL,
    "address" JSONB,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

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
    "vehicleType" TEXT,
    "vehicleCategory" TEXT,
    "batteryType" TEXT,
    "batteryCapacity" INTEGER,
    "nominalRange" INTEGER,
    "chargingOptions" TEXT,
    "chargerProvided" BOOLEAN,
    "noOfTyres" INTEGER,
    "tyres" JSONB,
    "batteryNumber" TEXT,
    "batteryModelNumber" TEXT,
    "batteryBrand" TEXT,
    "registrationType" TEXT,
    "ownershipType" TEXT,
    "dateOfPurchase" TIMESTAMPTZ(3),
    "dateOfDelivery" TIMESTAMPTZ(3),
    "dateOfRegistration" TIMESTAMPTZ(3),
    "dateOfOperation" TIMESTAMPTZ(3),
    "warrantyStartDate" TIMESTAMPTZ(3),
    "warrantyEndDate" TIMESTAMPTZ(3),
    "telematicsExpiryDate" TIMESTAMPTZ(3),
    "loanProvider" TEXT,
    "emiAmount" DECIMAL(14,2),
    "tenurePeriod" INTEGER,
    "emiDueDate" TIMESTAMPTZ(3),
    "insurancePolicyNumber" TEXT,
    "insuranceProvider" TEXT,
    "insurancePolicyType" TEXT,
    "insuranceValidFrom" TIMESTAMPTZ(3),
    "insuranceValidTo" TIMESTAMPTZ(3),
    "insurancePremiumAmount" DECIMAL(14,2),
    "insuranceStatus" TEXT,
    "insuranceThirdParty" TEXT,
    "vin" TEXT,
    "status" "VehicleStatus" NOT NULL DEFAULT 'IDLE',
    "acquiredAt" TIMESTAMPTZ(3),
    "retiredAt" TIMESTAMPTZ(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "statusChangedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contracts" (
    "id" TEXT NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "hubId" TEXT,
    "riderManagement" "B2BRiderMgmt" NOT NULL,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3),
    "vehicleCount" INTEGER NOT NULL,
    "vehicleModels" TEXT[],
    "dailyRate" DECIMAL(14,4) NOT NULL,
    "securityDeposit" DECIMAL(14,2),
    "billingFrequency" "BillingFrequency" NOT NULL,
    "minBillingDays" INTEGER,
    "graceDays" INTEGER,
    "paymentTermsDays" INTEGER,
    "replacementRules" TEXT,
    "downtimeRules" TEXT,
    "damageRecoveryRules" TEXT,
    "taxDetails" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "clientCode" TEXT,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "contactPerson" TEXT,
    "email" TEXT,
    "phoneNumber" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "vehicleCategory" TEXT,
    "vehicleModel" TEXT,
    "rentalType" "RentalType",
    "dailyRate" DECIMAL(14,4) NOT NULL,
    "weeklyRate" DECIMAL(14,4),
    "fortnightlyRate" DECIMAL(14,4),
    "monthlyRate" DECIMAL(14,4),
    "securityDeposit" DECIMAL(14,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "terms" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rentals" (
    "id" TEXT NOT NULL,
    "rentalNumber" TEXT NOT NULL,
    "rentalType" "RentalType" NOT NULL,
    "b2cMode" "B2CMode",
    "b2bRiderMgmt" "B2BRiderMgmt",
    "clientId" TEXT,
    "riderId" TEXT,
    "hubId" TEXT NOT NULL,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3),
    "expectedEndDate" TIMESTAMPTZ(3),
    "status" "RentalStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusChangedAt" TIMESTAMPTZ(3),
    "collectionPeriod" "CollectionPeriod" NOT NULL DEFAULT 'MONTHLY',
    "dailyRate" DECIMAL(14,4),
    "weeklyRate" DECIMAL(14,4),
    "fortnightlyRate" DECIMAL(14,4),
    "monthlyRate" DECIMAL(14,4),
    "securityDepositRequired" DECIMAL(14,2),
    "notes" TEXT,
    "activatedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "finalOutstandingAmount" DECIMAL(14,2),
    "finalDepositBalance" DECIMAL(14,2),
    "createdById" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rentals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_deployments" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "riderId" TEXT,
    "rentalId" TEXT,
    "outHubId" TEXT,
    "inHubId" TEXT,
    "assignedById" TEXT,
    "startDate" TIMESTAMPTZ(3) NOT NULL,
    "endDate" TIMESTAMPTZ(3),
    "startOdometer" INTEGER,
    "endOdometer" INTEGER,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "replacementForId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "payerType" "DepositPayerType" NOT NULL,
    "clientId" TEXT,
    "riderId" TEXT,
    "rentalId" TEXT,
    "amountRequired" DECIMAL(14,2) NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'REQUIRED',
    "dueDate" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_ledger_entries" (
    "id" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "type" "DepositEntryType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "authorizedById" TEXT,
    "collectionId" TEXT,
    "payStatementId" TEXT,
    "reversesEntryId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" TEXT NOT NULL,
    "purpose" "CollectionPurpose" NOT NULL DEFAULT 'RENT',
    "payerType" "CollectionPayerType" NOT NULL,
    "clientId" TEXT,
    "riderId" TEXT,
    "rentalDueId" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "referenceNumber" TEXT,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_dues" (
    "id" TEXT NOT NULL,
    "rentalId" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "dueDate" TIMESTAMPTZ(3) NOT NULL,
    "amountDue" DECIMAL(14,2) NOT NULL,
    "amountCollected" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(14,2) NOT NULL,
    "status" "RentalDueStatus" NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rental_dues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "entryType" "LedgerEntryType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "description" TEXT NOT NULL,
    "rentalId" TEXT,
    "riderId" TEXT,
    "payStatementId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reversesEntryId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_pay_statements" (
    "id" TEXT NOT NULL,
    "statementNumber" TEXT NOT NULL,
    "riderId" TEXT NOT NULL,
    "periodStart" TIMESTAMPTZ(3) NOT NULL,
    "periodEnd" TIMESTAMPTZ(3) NOT NULL,
    "status" "PayStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "grossCredits" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "netPayable" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "shortfallAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
    "calculationSnapshot" JSONB,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "paidById" TEXT,
    "paidAt" TIMESTAMPTZ(3),
    "paymentMethod" "PaymentMethod",
    "referenceNumber" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rider_pay_statements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rider_pay_statement_lines" (
    "id" TEXT NOT NULL,
    "payStatementId" TEXT NOT NULL,
    "lineType" "PayStatementLineType" NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "description" TEXT NOT NULL,
    "rentalId" TEXT,
    "ledgerEntryId" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rider_pay_statement_lines_pkey" PRIMARY KEY ("id")
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
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMPTZ(3),
    "voidedById" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

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
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "title" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "url" TEXT NOT NULL,
    "issueDate" TIMESTAMPTZ(3),
    "expiryDate" TIMESTAMPTZ(3),
    "documentNumber" TEXT,
    "riderId" TEXT,
    "staffId" TEXT,
    "vehicleId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "serviceNumber" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "rentalId" TEXT,
    "serviceType" "ServiceType" NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'REPORTED',
    "statusChangedAt" TIMESTAMPTZ(3),
    "responsibleParty" "ResponsibleParty" NOT NULL DEFAULT 'UNKNOWN',
    "reportedById" TEXT,
    "approvedById" TEXT,
    "assignedToId" TEXT,
    "reportedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancellationReason" TEXT,
    "downtimeStart" TIMESTAMPTZ(3),
    "downtimeEnd" TIMESTAMPTZ(3),
    "downtimeReason" TEXT,
    "previousVehicleStatus" "VehicleStatus",
    "description" TEXT,
    "diagnosis" TEXT,
    "repairNotes" TEXT,
    "resolutionNotes" TEXT,
    "responsibilityApprovedAt" TIMESTAMPTZ(3),
    "responsibilityInvestigationNotes" TEXT,
    "responsibilityEvidence" JSONB,
    "replacementVehicleId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

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
    "sourceType" TEXT,
    "sourceId" TEXT,
    "serviceSpareId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "service_charges_pkey" PRIMARY KEY ("id")
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
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_spares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "replacement_assignments" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "originalVehicleId" TEXT NOT NULL,
    "replacementVehicleId" TEXT NOT NULL,
    "rentalId" TEXT,
    "replacementRentalId" TEXT,
    "riderId" TEXT,
    "clientId" TEXT,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMPTZ(3),
    "assignedById" TEXT,
    "returnedById" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "replacement_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spare_parts" (
    "id" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "unitOfMeasure" TEXT NOT NULL DEFAULT 'UNIT',
    "purchasePrice" DECIMAL(14,4),
    "unitCost" DECIMAL(14,4) NOT NULL,
    "minimumStock" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" TEXT NOT NULL,
    "spareId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "spareId" TEXT NOT NULL,
    "movementType" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "unitCost" DECIMAL(14,4),
    "hubId" TEXT,
    "fromHubId" TEXT,
    "toHubId" TEXT,
    "serviceId" TEXT,
    "vehicleId" TEXT,
    "movedById" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "notes" TEXT,
    "movedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "staff_aadharNumber_key" ON "staff"("aadharNumber");

-- CreateIndex
CREATE UNIQUE INDEX "staff_panNumber_key" ON "staff"("panNumber");

-- CreateIndex
CREATE INDEX "staff_hubId_idx" ON "staff"("hubId");

-- CreateIndex
CREATE UNIQUE INDEX "riders_userId_key" ON "riders"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "riders_riderCode_key" ON "riders"("riderCode");

-- CreateIndex
CREATE UNIQUE INDEX "riders_aadharNumber_key" ON "riders"("aadharNumber");

-- CreateIndex
CREATE UNIQUE INDEX "riders_panNumber_key" ON "riders"("panNumber");

-- CreateIndex
CREATE UNIQUE INDEX "riders_deliveryPartnerCode_key" ON "riders"("deliveryPartnerCode");

-- CreateIndex
CREATE INDEX "riders_hubId_idx" ON "riders"("hubId");

-- CreateIndex
CREATE INDEX "riders_clientId_idx" ON "riders"("clientId");

-- CreateIndex
CREATE INDEX "riders_status_idx" ON "riders"("status");

-- CreateIndex
CREATE INDEX "riders_rentalType_idx" ON "riders"("rentalType");

-- CreateIndex
CREATE INDEX "riders_b2cMode_idx" ON "riders"("b2cMode");

-- CreateIndex
CREATE INDEX "riders_b2bRiderMgmt_idx" ON "riders"("b2bRiderMgmt");

-- CreateIndex
CREATE UNIQUE INDEX "hubs_name_key" ON "hubs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "hubs_hubCode_key" ON "hubs"("hubCode");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_registrationNumber_key" ON "vehicles"("registrationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE INDEX "vehicles_hubId_idx" ON "vehicles"("hubId");

-- CreateIndex
CREATE INDEX "vehicles_status_idx" ON "vehicles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "client_contracts_contractNumber_key" ON "client_contracts"("contractNumber");

-- CreateIndex
CREATE INDEX "client_contracts_clientId_startDate_idx" ON "client_contracts"("clientId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "clients_clientCode_key" ON "clients"("clientCode");

-- CreateIndex
CREATE INDEX "clients_isActive_idx" ON "clients"("isActive");

-- CreateIndex
CREATE INDEX "clients_phoneNumber_idx" ON "clients"("phoneNumber");

-- CreateIndex
CREATE INDEX "clients_email_idx" ON "clients"("email");

-- CreateIndex
CREATE INDEX "clients_deletedAt_idx" ON "clients"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_cards_code_key" ON "rate_cards"("code");

-- CreateIndex
CREATE INDEX "rate_cards_vehicleCategory_idx" ON "rate_cards"("vehicleCategory");

-- CreateIndex
CREATE INDEX "rate_cards_rentalType_idx" ON "rate_cards"("rentalType");

-- CreateIndex
CREATE INDEX "rate_cards_isActive_idx" ON "rate_cards"("isActive");

-- CreateIndex
CREATE INDEX "rate_cards_deletedAt_idx" ON "rate_cards"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "rentals_rentalNumber_key" ON "rentals"("rentalNumber");

-- CreateIndex
CREATE INDEX "rentals_clientId_status_idx" ON "rentals"("clientId", "status");

-- CreateIndex
CREATE INDEX "rentals_riderId_status_idx" ON "rentals"("riderId", "status");

-- CreateIndex
CREATE INDEX "rentals_hubId_idx" ON "rentals"("hubId");

-- CreateIndex
CREATE INDEX "rentals_startDate_endDate_idx" ON "rentals"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "rentals_status_collectionPeriod_idx" ON "rentals"("status", "collectionPeriod");

-- CreateIndex
CREATE INDEX "vehicle_deployments_vehicleId_status_idx" ON "vehicle_deployments"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "vehicle_deployments_riderId_status_idx" ON "vehicle_deployments"("riderId", "status");

-- CreateIndex
CREATE INDEX "vehicle_deployments_rentalId_status_idx" ON "vehicle_deployments"("rentalId", "status");

-- CreateIndex
CREATE INDEX "vehicle_deployments_outHubId_idx" ON "vehicle_deployments"("outHubId");

-- CreateIndex
CREATE INDEX "vehicle_deployments_inHubId_idx" ON "vehicle_deployments"("inHubId");

-- CreateIndex
CREATE INDEX "deposits_clientId_idx" ON "deposits"("clientId");

-- CreateIndex
CREATE INDEX "deposits_riderId_idx" ON "deposits"("riderId");

-- CreateIndex
CREATE INDEX "deposits_status_idx" ON "deposits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_rentalId_key" ON "deposits"("rentalId");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_ledger_entries_reversesEntryId_key" ON "deposit_ledger_entries"("reversesEntryId");

-- CreateIndex
CREATE INDEX "deposit_ledger_entries_depositId_createdAt_idx" ON "deposit_ledger_entries"("depositId", "createdAt");

-- CreateIndex
CREATE INDEX "deposit_ledger_entries_collectionId_idx" ON "deposit_ledger_entries"("collectionId");

-- CreateIndex
CREATE INDEX "collections_clientId_receivedAt_idx" ON "collections"("clientId", "receivedAt");

-- CreateIndex
CREATE INDEX "collections_riderId_receivedAt_idx" ON "collections"("riderId", "receivedAt");

-- CreateIndex
CREATE INDEX "collections_rentalDueId_idx" ON "collections"("rentalDueId");

-- CreateIndex
CREATE INDEX "rental_dues_rentalId_status_dueDate_idx" ON "rental_dues"("rentalId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "rental_dues_status_dueDate_idx" ON "rental_dues"("status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "rental_dues_rentalId_periodStart_periodEnd_key" ON "rental_dues"("rentalId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_reversesEntryId_key" ON "ledger_entries"("reversesEntryId");

-- CreateIndex
CREATE INDEX "ledger_entries_rentalId_occurredAt_idx" ON "ledger_entries"("rentalId", "occurredAt");

-- CreateIndex
CREATE INDEX "ledger_entries_riderId_occurredAt_idx" ON "ledger_entries"("riderId", "occurredAt");

-- CreateIndex
CREATE INDEX "ledger_entries_payStatementId_idx" ON "ledger_entries"("payStatementId");

-- CreateIndex
CREATE INDEX "ledger_entries_sourceType_sourceId_idx" ON "ledger_entries"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "rider_pay_statements_statementNumber_key" ON "rider_pay_statements"("statementNumber");

-- CreateIndex
CREATE INDEX "rider_pay_statements_riderId_periodStart_periodEnd_idx" ON "rider_pay_statements"("riderId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "rider_pay_statements_status_idx" ON "rider_pay_statements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "rider_pay_statement_lines_ledgerEntryId_key" ON "rider_pay_statement_lines"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "rider_pay_statement_lines_payStatementId_idx" ON "rider_pay_statement_lines"("payStatementId");

-- CreateIndex
CREATE INDEX "rider_pay_statement_lines_rentalId_idx" ON "rider_pay_statement_lines"("rentalId");

-- CreateIndex
CREATE INDEX "rider_pay_statement_lines_ledgerEntryId_idx" ON "rider_pay_statement_lines"("ledgerEntryId");

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
CREATE INDEX "documents_riderId_idx" ON "documents"("riderId");

-- CreateIndex
CREATE INDEX "documents_staffId_idx" ON "documents"("staffId");

-- CreateIndex
CREATE INDEX "documents_vehicleId_idx" ON "documents"("vehicleId");

-- CreateIndex
CREATE INDEX "documents_documentType_documentNumber_idx" ON "documents"("documentType", "documentNumber");

-- CreateIndex
CREATE INDEX "documents_expiryDate_idx" ON "documents"("expiryDate");

-- CreateIndex
CREATE INDEX "documents_deletedAt_idx" ON "documents"("deletedAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_resourceId_idx" ON "audit_logs"("resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs"("resource");

-- CreateIndex
CREATE UNIQUE INDEX "services_serviceNumber_key" ON "services"("serviceNumber");

-- CreateIndex
CREATE INDEX "services_vehicleId_status_idx" ON "services"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "services_rentalId_idx" ON "services"("rentalId");

-- CreateIndex
CREATE INDEX "services_reportedAt_idx" ON "services"("reportedAt");

-- CreateIndex
CREATE INDEX "services_replacementVehicleId_idx" ON "services"("replacementVehicleId");

-- CreateIndex
CREATE INDEX "services_status_idx" ON "services"("status");

-- CreateIndex
CREATE UNIQUE INDEX "service_charges_serviceSpareId_key" ON "service_charges"("serviceSpareId");

-- CreateIndex
CREATE INDEX "service_charges_serviceId_idx" ON "service_charges"("serviceId");

-- CreateIndex
CREATE INDEX "service_charges_sourceType_sourceId_idx" ON "service_charges"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "service_spares_inventoryMovementId_key" ON "service_spares"("inventoryMovementId");

-- CreateIndex
CREATE INDEX "service_spares_serviceId_idx" ON "service_spares"("serviceId");

-- CreateIndex
CREATE INDEX "service_spares_spareId_idx" ON "service_spares"("spareId");

-- CreateIndex
CREATE INDEX "replacement_assignments_serviceId_status_idx" ON "replacement_assignments"("serviceId", "status");

-- CreateIndex
CREATE INDEX "replacement_assignments_replacementVehicleId_status_idx" ON "replacement_assignments"("replacementVehicleId", "status");

-- CreateIndex
CREATE INDEX "replacement_assignments_originalVehicleId_idx" ON "replacement_assignments"("originalVehicleId");

-- CreateIndex
CREATE INDEX "replacement_assignments_rentalId_idx" ON "replacement_assignments"("rentalId");

-- CreateIndex
CREATE INDEX "replacement_assignments_replacementRentalId_idx" ON "replacement_assignments"("replacementRentalId");

-- CreateIndex
CREATE UNIQUE INDEX "spare_parts_partNumber_key" ON "spare_parts"("partNumber");

-- CreateIndex
CREATE INDEX "spare_parts_name_idx" ON "spare_parts"("name");

-- CreateIndex
CREATE INDEX "spare_parts_category_idx" ON "spare_parts"("category");

-- CreateIndex
CREATE INDEX "spare_parts_isActive_idx" ON "spare_parts"("isActive");

-- CreateIndex
CREATE INDEX "inventory_balances_hubId_idx" ON "inventory_balances"("hubId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balances_spareId_hubId_key" ON "inventory_balances"("spareId", "hubId");

-- CreateIndex
CREATE INDEX "inventory_movements_spareId_movedAt_idx" ON "inventory_movements"("spareId", "movedAt");

-- CreateIndex
CREATE INDEX "inventory_movements_spareId_hubId_movedAt_idx" ON "inventory_movements"("spareId", "hubId", "movedAt");

-- CreateIndex
CREATE INDEX "inventory_movements_fromHubId_idx" ON "inventory_movements"("fromHubId");

-- CreateIndex
CREATE INDEX "inventory_movements_toHubId_idx" ON "inventory_movements"("toHubId");

-- CreateIndex
CREATE INDEX "inventory_movements_serviceId_idx" ON "inventory_movements"("serviceId");

-- CreateIndex
CREATE INDEX "inventory_movements_vehicleId_idx" ON "inventory_movements"("vehicleId");

-- CreateIndex
CREATE INDEX "inventory_movements_referenceType_referenceId_idx" ON "inventory_movements"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "_PermissionToRole_B_index" ON "_PermissionToRole"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "riders" ADD CONSTRAINT "riders_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rentals" ADD CONSTRAINT "rentals_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_deployments" ADD CONSTRAINT "vehicle_deployments_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_deployments" ADD CONSTRAINT "vehicle_deployments_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_deployments" ADD CONSTRAINT "vehicle_deployments_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_deployments" ADD CONSTRAINT "vehicle_deployments_outHubId_fkey" FOREIGN KEY ("outHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_deployments" ADD CONSTRAINT "vehicle_deployments_inHubId_fkey" FOREIGN KEY ("inHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_deployments" ADD CONSTRAINT "vehicle_deployments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_deployments" ADD CONSTRAINT "vehicle_deployments_replacementForId_fkey" FOREIGN KEY ("replacementForId") REFERENCES "vehicle_deployments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_ledger_entries" ADD CONSTRAINT "deposit_ledger_entries_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_ledger_entries" ADD CONSTRAINT "deposit_ledger_entries_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_ledger_entries" ADD CONSTRAINT "deposit_ledger_entries_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_ledger_entries" ADD CONSTRAINT "deposit_ledger_entries_payStatementId_fkey" FOREIGN KEY ("payStatementId") REFERENCES "rider_pay_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_ledger_entries" ADD CONSTRAINT "deposit_ledger_entries_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "deposit_ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_rentalDueId_fkey" FOREIGN KEY ("rentalDueId") REFERENCES "rental_dues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_dues" ADD CONSTRAINT "rental_dues_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_payStatementId_fkey" FOREIGN KEY ("payStatementId") REFERENCES "rider_pay_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_reversesEntryId_fkey" FOREIGN KEY ("reversesEntryId") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_pay_statements" ADD CONSTRAINT "rider_pay_statements_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_pay_statements" ADD CONSTRAINT "rider_pay_statements_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_pay_statements" ADD CONSTRAINT "rider_pay_statements_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_pay_statement_lines" ADD CONSTRAINT "rider_pay_statement_lines_payStatementId_fkey" FOREIGN KEY ("payStatementId") REFERENCES "rider_pay_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_pay_statement_lines" ADD CONSTRAINT "rider_pay_statement_lines_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rider_pay_statement_lines" ADD CONSTRAINT "rider_pay_statement_lines_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "ledger_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_serviceChargeId_fkey" FOREIGN KEY ("serviceChargeId") REFERENCES "service_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_replacementVehicleId_fkey" FOREIGN KEY ("replacementVehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_charges" ADD CONSTRAINT "service_charges_serviceSpareId_fkey" FOREIGN KEY ("serviceSpareId") REFERENCES "service_spares"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_spares" ADD CONSTRAINT "service_spares_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_spares" ADD CONSTRAINT "service_spares_spareId_fkey" FOREIGN KEY ("spareId") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_spares" ADD CONSTRAINT "service_spares_inventoryMovementId_fkey" FOREIGN KEY ("inventoryMovementId") REFERENCES "inventory_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_originalVehicleId_fkey" FOREIGN KEY ("originalVehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_replacementVehicleId_fkey" FOREIGN KEY ("replacementVehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_replacementRentalId_fkey" FOREIGN KEY ("replacementRentalId") REFERENCES "rentals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "replacement_assignments" ADD CONSTRAINT "replacement_assignments_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_spareId_fkey" FOREIGN KEY ("spareId") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_spareId_fkey" FOREIGN KEY ("spareId") REFERENCES "spare_parts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_fromHubId_fkey" FOREIGN KEY ("fromHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_toHubId_fkey" FOREIGN KEY ("toHubId") REFERENCES "hubs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_movedById_fkey" FOREIGN KEY ("movedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
