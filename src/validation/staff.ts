import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

export const staffStatusSchema = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]);

const optionalNullableUuid = (field: string) =>
  z.string().uuid(`${field} must be a valid UUID`).nullable().optional();

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

export const createStaffSchema = z.object({
  fullName: z.string().trim().min(1, "fullName is required").max(150),
  userId: optionalNullableUuid("userId"),
  employeeCode: optionalNullableString(50),
  phoneNumber: optionalNullableString(20),
  hubId: optionalNullableUuid("hubId"),
  jobTitle: optionalNullableString(100),
  status: staffStatusSchema.optional(),
});

export const updateStaffSchema = createStaffSchema.partial();

export const listStaffQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    hubId: z.string().uuid("hubId must be a valid UUID").optional(),
    status: staffStatusSchema.optional(),
  });

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;
