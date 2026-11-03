import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

export const vehicleStatusSchema = z.enum([
  "IDLE",
  "DEPLOYED",
  "IN_SERVICE",
  "UNDER_REPAIR",
  "OUT_OF_SERVICE",
  "RETIRED",
]);

const optionalNullableUuid = (field: string) =>
  z.string().uuid(`${field} must be a valid UUID`).nullable().optional();

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

const currentYear = new Date().getFullYear();

const vehicleBaseSchema = z.object({
  registrationNumber: z
    .string()
    .trim()
    .min(1, "registrationNumber is required")
    .max(15, "registrationNumber must be at most 15 characters"),
  hubId: optionalNullableUuid("hubId"),
  make: optionalNullableString(100),
  model: optionalNullableString(100),
  year: z
    .number()
    .int("year must be an integer")
    .min(1900, "year must be at least 1900")
    .max(currentYear + 1, "year cannot be in the future")
    .nullable()
    .optional(),
  color: optionalNullableString(50),
  vin: optionalNullableString(50),
  acquiredAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});

// Strict objects reject system-managed fields (id, status, version, timestamps,
// deletedAt, retiredAt) instead of silently accepting and discarding them.
export const createVehicleSchema = vehicleBaseSchema.strict();

export const updateVehicleSchema = vehicleBaseSchema.partial().strict();

export const listVehiclesQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    status: vehicleStatusSchema.optional(),
    hubId: z.string().uuid("hubId must be a valid UUID").optional(),
    make: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(100).optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    sortBy: z
      .enum([
        "registrationNumber",
        "make",
        "model",
        "year",
        "status",
        "acquiredAt",
        "createdAt",
        "updatedAt",
      ])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export const changeVehicleStatusSchema = z
  .object({
    status: vehicleStatusSchema,
    reason: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const listVehicleStatusHistoryQuerySchema = paginationQuerySchema;

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;
export type ChangeVehicleStatusInput = z.infer<
  typeof changeVehicleStatusSchema
>;
export type ListVehicleStatusHistoryQuery = z.infer<
  typeof listVehicleStatusHistoryQuerySchema
>;
