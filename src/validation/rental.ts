import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

export const rentalTypeSchema = z.enum(["B2C", "B2B"]);
export const b2cModeSchema = z.enum(["AML_RIDER", "INDIVIDUAL_RIDER"]);
export const b2bRiderMgmtSchema = z.enum(["CLIENT_MANAGED", "AML_MANAGED"]);
export const collectionPeriodSchema = z.enum([
  "WEEKLY",
  "EVERY_15_DAYS",
  "MONTHLY",
]);
export const billingFrequencySchema = z.enum([
  "WEEKLY",
  "FORTNIGHTLY",
  "MONTHLY",
]);
export const rentalStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "TERMINATED",
  "CANCELLED",
]);
export const vehicleStatusOnReturnSchema = z.enum([
  "IDLE",
  "IN_SERVICE",
  "UNDER_REPAIR",
  "OUT_OF_SERVICE",
]);

const decimalString = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "number" ? String(value) : value.trim()));

function moneySchema(
  scale: number,
  label: string,
  options: { positive?: boolean } = {}
) {
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  return decimalString
    .refine(
      (value) => pattern.test(value),
      `${label} must be a non-negative decimal with at most ${scale} decimal places`
    )
    .refine(
      (value) => Number(value) <= 9_999_999_999.99,
      `${label} is too large`
    )
    .refine(
      (value) => !options.positive || Number(value) > 0,
      `${label} must be greater than 0`
    );
}

const optionalNullableUuid = (field: string) =>
  z.string().uuid(`${field} must be a valid UUID`).nullable().optional();

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter ISO code")
  .transform((value) => value.toUpperCase());

export const manualPricingSchema = z
  .object({
    dailyRate: moneySchema(4, "dailyRate", { positive: true }),
    weeklyRate: moneySchema(4, "weeklyRate").nullable().optional(),
    fortnightlyRate: moneySchema(4, "fortnightlyRate").nullable().optional(),
    monthlyRate: moneySchema(4, "monthlyRate").nullable().optional(),
    securityDeposit: moneySchema(2, "securityDeposit").nullable().optional(),
    currency: currencySchema.optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const createRentalBaseSchema = z
  .object({
    rentalType: rentalTypeSchema,
    b2cMode: b2cModeSchema.nullable().optional(),
    b2bRiderMgmt: b2bRiderMgmtSchema.nullable().optional(),
    clientId: z.string().uuid("clientId must be a valid UUID"),
    riderId: optionalNullableUuid("riderId"),
    hubId: optionalNullableUuid("hubId"),
    vehicleId: optionalNullableUuid("vehicleId"),
    rateCardId: optionalNullableUuid("rateCardId"),
    startDate: z.coerce.date(),
    expectedEndDate: z.coerce.date().nullable().optional(),
    billingFrequency: billingFrequencySchema.nullable().optional(),
    collectionPeriod: collectionPeriodSchema,
    currency: currencySchema.optional(),
    securityDepositAmount: moneySchema(2, "securityDepositAmount"),
    manualPricing: manualPricingSchema.nullable().optional(),
    agreementRef: optionalNullableString(100),
    notes: optionalNullableString(2000),
  })
  .strict();

function validateRentalClassification(
  value: {
    rentalType: "B2C" | "B2B";
    b2cMode?: "AML_RIDER" | "INDIVIDUAL_RIDER" | null;
    b2bRiderMgmt?: "CLIENT_MANAGED" | "AML_MANAGED" | null;
    riderId?: string | null;
    startDate?: Date;
    expectedEndDate?: Date | null;
  },
  ctx: z.RefinementCtx
) {
  if (value.rentalType === "B2C") {
    if (!value.b2cMode) {
      ctx.addIssue({
        code: "custom",
        path: ["b2cMode"],
        message: "b2cMode is required for B2C rentals",
      });
    }
    if (value.b2bRiderMgmt) {
      ctx.addIssue({
        code: "custom",
        path: ["b2bRiderMgmt"],
        message: "b2bRiderMgmt is not applicable to B2C rentals",
      });
    }
    if (!value.riderId) {
      ctx.addIssue({
        code: "custom",
        path: ["riderId"],
        message: "riderId is required for B2C rentals",
      });
    }
  }

  if (value.rentalType === "B2B") {
    if (!value.b2bRiderMgmt) {
      ctx.addIssue({
        code: "custom",
        path: ["b2bRiderMgmt"],
        message: "b2bRiderMgmt is required for B2B rentals",
      });
    }
    if (value.b2cMode) {
      ctx.addIssue({
        code: "custom",
        path: ["b2cMode"],
        message: "b2cMode is not applicable to B2B rentals",
      });
    }
  }

  if (
    value.expectedEndDate &&
    value.startDate &&
    value.expectedEndDate.getTime() <= value.startDate.getTime()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["expectedEndDate"],
      message: "expectedEndDate must be later than startDate",
    });
  }
}

export const createRentalSchema = createRentalBaseSchema.superRefine(
  validateRentalClassification
);

export const listRentalsQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    rentalType: rentalTypeSchema.optional(),
    status: rentalStatusSchema.optional(),
    clientId: z.string().uuid("clientId must be a valid UUID").optional(),
    riderId: z.string().uuid("riderId must be a valid UUID").optional(),
    hubId: z.string().uuid("hubId must be a valid UUID").optional(),
    collectionPeriod: collectionPeriodSchema.optional(),
    sortBy: z
      .enum([
        "rentalNumber",
        "startDate",
        "expectedEndDate",
        "status",
        "createdAt",
        "updatedAt",
      ])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export const assignVehicleSchema = z
  .object({
    vehicleId: z.string().uuid("vehicleId must be a valid UUID"),
    startDate: z.coerce.date().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const activateRentalSchema = z
  .object({
    activatedAt: z.coerce.date().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .default({});

const adjustmentSchema = z
  .object({
    amount: moneySchema(2, "amount", { positive: true }),
    direction: z.enum(["CREDIT", "DEBIT"]),
    reason: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const refundSchema = z
  .object({
    amount: moneySchema(2, "amount", { positive: true }),
    reference: z.string().trim().min(1).max(200).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const closeRentalSchema = z
  .object({
    endDate: z.coerce.date().optional(),
    vehicleReturnStatus: vehicleStatusOnReturnSchema.optional(),
    depositRefund: refundSchema.nullable().optional(),
    depositAdjustment: adjustmentSchema.nullable().optional(),
    rentAdjustment: adjustmentSchema.nullable().optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .default({});

export type CreateRentalInput = z.infer<typeof createRentalSchema>;
export type ListRentalsQuery = z.infer<typeof listRentalsQuerySchema>;
export type AssignVehicleInput = z.infer<typeof assignVehicleSchema>;
export type ActivateRentalInput = z.infer<typeof activateRentalSchema>;
export type CloseRentalInput = z.infer<typeof closeRentalSchema>;
export type CollectionPeriod = z.infer<typeof collectionPeriodSchema>;
