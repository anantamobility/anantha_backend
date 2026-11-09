import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

const decimalString = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "number" ? String(value) : value.trim()));

function moneySchema(scale: number, label: string, positive = false) {
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
      (value) => !positive || Number(value) > 0,
      `${label} must be greater than 0`
    );
}

export const serviceTypeSchema = z.enum([
  "TECHNICAL",
  "PREVENTIVE",
  "ACCIDENT",
  "RIDER_DAMAGE",
  "OTHER",
]);

export const serviceStatusSchema = z.enum([
  "REPORTED",
  "APPROVED",
  "IN_PROGRESS",
  "AWAITING_PARTS",
  "COMPLETED",
  "CLOSED",
  "CANCELLED",
]);

export const responsiblePartySchema = z.enum([
  "AML",
  "RIDER",
  "CLIENT",
  "THIRD_PARTY",
  "INSURANCE",
  "UNKNOWN",
]);

export const serviceChargeTypeSchema = z.enum([
  "LABOR",
  "SPARE_PARTS",
  "OTHER_COST",
  "DOWNTIME_RENT",
  "REPLACEMENT_RENT",
]);

const optionalNullableUuid = (field: string) =>
  z.string().uuid(`${field} must be a valid UUID`).nullable().optional();

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

export const createServiceSchema = z
  .object({
    vehicleId: z.string().uuid("vehicleId must be a valid UUID"),
    rentalId: optionalNullableUuid("rentalId"),
    serviceType: serviceTypeSchema,
    description: optionalNullableString(2000),
    diagnosis: optionalNullableString(4000),
    assignedToId: optionalNullableUuid("assignedToId"),
    downtimeReason: optionalNullableString(500),
    reportedAt: z.coerce.date().optional(),
  })
  .strict();

export const updateServiceSchema = z
  .object({
    description: optionalNullableString(2000),
    diagnosis: optionalNullableString(4000),
    repairNotes: optionalNullableString(4000),
    resolutionNotes: optionalNullableString(4000),
    assignedToId: optionalNullableUuid("assignedToId"),
    downtimeReason: optionalNullableString(500),
  })
  .strict();

export const listServicesQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    status: serviceStatusSchema.optional(),
    serviceType: serviceTypeSchema.optional(),
    vehicleId: z.string().uuid("vehicleId must be a valid UUID").optional(),
    rentalId: z.string().uuid("rentalId must be a valid UUID").optional(),
    responsibleParty: responsiblePartySchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sortBy: z
      .enum(["serviceNumber", "reportedAt", "startedAt", "status", "createdAt", "updatedAt"])
      .default("reportedAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export const startServiceSchema = z
  .object({
    startedAt: z.coerce.date().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .default({});

export const awaitPartsSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .default({});

export const resumeServiceSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .default({});

export const completeServiceSchema = z
  .object({
    completedAt: z.coerce.date().optional(),
    repairNotes: optionalNullableString(4000),
    resolutionNotes: optionalNullableString(4000),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .default({});

export const closeServiceSchema = z
  .object({
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict()
  .default({});

export const cancelServiceSchema = z
  .object({
    reason: z.string().trim().min(1, "reason is required to cancel a service order").max(500),
    notes: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();

export const approveResponsibilitySchema = z
  .object({
    responsibility: responsiblePartySchema,
    investigationNotes: z
      .string()
      .trim()
      .min(1, "investigationNotes is required")
      .max(4000),
    evidence: z.record(z.string(), z.unknown()).nullable().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const assignReplacementSchema = z
  .object({
    replacementVehicleId: z
      .string()
      .uuid("replacementVehicleId must be a valid UUID"),
    replacementRentalId: optionalNullableUuid("replacementRentalId"),
    riderId: optionalNullableUuid("riderId"),
    clientId: optionalNullableUuid("clientId"),
    assignedAt: z.coerce.date().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    notes: optionalNullableString(2000),
  })
  .strict();

export const returnReplacementSchema = z
  .object({
    returnedAt: z.coerce.date().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    notes: optionalNullableString(2000),
  })
  .strict()
  .default({});

export const createServiceChargeSchema = z
  .object({
    chargeType: serviceChargeTypeSchema,
    costAmount: moneySchema(2, "costAmount", true),
    description: z.string().trim().min(1).max(2000).optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;
export type StartServiceInput = z.infer<typeof startServiceSchema>;
export type AwaitPartsInput = z.infer<typeof awaitPartsSchema>;
export type ResumeServiceInput = z.infer<typeof resumeServiceSchema>;
export type CompleteServiceInput = z.infer<typeof completeServiceSchema>;
export type CloseServiceInput = z.infer<typeof closeServiceSchema>;
export type CancelServiceInput = z.infer<typeof cancelServiceSchema>;
export type ApproveResponsibilityInput = z.infer<
  typeof approveResponsibilitySchema
>;
export type AssignReplacementInput = z.infer<typeof assignReplacementSchema>;
export type ReturnReplacementInput = z.infer<typeof returnReplacementSchema>;
export type CreateServiceChargeInput = z.infer<
  typeof createServiceChargeSchema
>;
