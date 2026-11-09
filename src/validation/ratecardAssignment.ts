import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

export const rateCardAssignmentStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
  "CANCELLED",
]);

const assignableStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

function validateDateRange(
  value: { validFrom?: Date; validUntil?: Date | null },
  ctx: z.RefinementCtx
) {
  if (
    value.validUntil &&
    value.validFrom &&
    value.validUntil.getTime() <= value.validFrom.getTime()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["validUntil"],
      message: "validUntil must be later than validFrom",
    });
  }
}

export const createRateCardAssignmentSchema = z
  .object({
    clientId: z.string().uuid("clientId must be a valid UUID"),
    rateCardId: z.string().uuid("rateCardId must be a valid UUID"),
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    status: assignableStatusSchema.optional(),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict()
  .superRefine(validateDateRange);

export const updateRateCardAssignmentSchema = z
  .object({
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().nullable().optional(),
    status: assignableStatusSchema.optional(),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
  })
  .strict();

export const unassignRateCardAssignmentSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict()
  .default({});

export const listRateCardAssignmentsQuerySchema = paginationQuerySchema.extend({
  clientId: z.string().uuid("clientId must be a valid UUID").optional(),
  rateCardId: z.string().uuid("rateCardId must be a valid UUID").optional(),
  status: rateCardAssignmentStatusSchema.optional(),
  validOn: z.coerce.date().optional(),
  sortBy: z
    .enum([
      "assignedAt",
      "validFrom",
      "validUntil",
      "createdAt",
      "updatedAt",
    ])
    .default("assignedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const listClientRateCardsQuerySchema =
  listRateCardAssignmentsQuerySchema.omit({ clientId: true }).extend(
    searchQuerySchema.shape
  );

export const listRateCardClientsQuerySchema =
  listRateCardAssignmentsQuerySchema.omit({ rateCardId: true }).extend(
    searchQuerySchema.shape
  );

export type CreateRateCardAssignmentInput = z.infer<
  typeof createRateCardAssignmentSchema
>;
export type UpdateRateCardAssignmentInput = z.infer<
  typeof updateRateCardAssignmentSchema
>;
export type UnassignRateCardAssignmentInput = z.infer<
  typeof unassignRateCardAssignmentSchema
>;
export type ListRateCardAssignmentsQuery = z.infer<
  typeof listRateCardAssignmentsQuerySchema
>;
export type ListClientRateCardsQuery = z.infer<
  typeof listClientRateCardsQuerySchema
>;
export type ListRateCardClientsQuery = z.infer<
  typeof listRateCardClientsQuerySchema
>;
export type RateCardAssignmentStatus = z.infer<
  typeof rateCardAssignmentStatusSchema
>;
