import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";
import { vehicleStatusOnReturnSchema } from "./rental.js";

const assignmentStatusSchema = z.enum([
  "ACTIVE",
  "COMPLETED",
  "TRANSFERRED",
  "CANCELLED",
]);

export const deployOutSchema = z
  .object({
    rentalId: z.string().uuid("rentalId must be a valid UUID"),
    vehicleId: z.string().uuid("vehicleId must be a valid UUID"),
    outHubId: z.string().uuid("outHubId must be a valid UUID"),
    startDate: z.coerce.date().optional(),
    startOdometer: z.number().int().min(0).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const deployInSchema = z
  .object({
    inHubId: z.string().uuid("inHubId must be a valid UUID"),
    endDate: z.coerce.date().optional(),
    endOdometer: z.number().int().min(0).optional(),
    vehicleReturnStatus: vehicleStatusOnReturnSchema.optional(),
  })
  .strict();

export const listDeploymentsQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    rentalId: z.string().uuid("rentalId must be a valid UUID").optional(),
    vehicleId: z.string().uuid("vehicleId must be a valid UUID").optional(),
    riderId: z.string().uuid("riderId must be a valid UUID").optional(),
    outHubId: z.string().uuid("outHubId must be a valid UUID").optional(),
    inHubId: z.string().uuid("inHubId must be a valid UUID").optional(),
    status: assignmentStatusSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sortBy: z
      .enum(["startDate", "endDate", "createdAt"])
      .default("startDate"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export type DeployOutInput = z.infer<typeof deployOutSchema>;
export type DeployInInput = z.infer<typeof deployInSchema>;
export type ListDeploymentsQuery = z.infer<typeof listDeploymentsQuerySchema>;
