import { z } from "zod";
import {
  addressSchema,
  genderSchema,
  paginationQuerySchema,
  pastDateSchema,
  searchQuerySchema,
} from "./common.js";
import { emailSchema, phoneSchema, strongPasswordSchema } from "./user.js";

export const staffStatusSchema = z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]);

export const employmentTypeSchema = z.enum([
  "INTERN",
  "TRAINEE",
  "FULL_TIME",
  "PART_TIME",
  "CONSULTANT",
]);

export const workModeSchema = z.enum(["REMOTE", "ONSITE", "HYBRID"]);

const optionalNullableUuid = (field: string) =>
  z.string().uuid(`${field} must be a valid UUID`).nullable().optional();

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

const optionalDate = z.coerce.date().nullable().optional();

const staffBaseShape = {
  fullName: z.string().trim().min(1, "fullName is required").max(150),
  gender: genderSchema,
  dateOfBirth: pastDateSchema,
  department: optionalNullableString(100),
  employeeCode: optionalNullableString(50),
  hubId: optionalNullableUuid("hubId"),
  jobTitle: optionalNullableString(100),
  status: staffStatusSchema.optional(),

  alternatePhone: phoneSchema.nullable().optional(),
  address: addressSchema,
  emergencyContactName: optionalNullableString(150),
  emergencyContactPhone: phoneSchema.nullable().optional(),
  bloodGroup: optionalNullableString(10),
  employmentType: employmentTypeSchema.nullable().optional(),
  workMode: workModeSchema.nullable().optional(),
  educationalQualification: optionalNullableString(150),
  anniversary: optionalDate,
  dateOfJoining: optionalDate,
  probationEndDate: optionalDate,
  dateOfLastWorkingDay: optionalDate,
  dateOfRelieving: optionalDate,

  aadharNumber: optionalNullableString(20),
  panNumber: optionalNullableString(20),
  bankName: optionalNullableString(100),
  branch: optionalNullableString(100),
  bankAccountNumber: optionalNullableString(34),
  bankIfsc: optionalNullableString(20),
  bankHolderName: optionalNullableString(150),
};

export const createStaffSchema = z
  .object({
    ...staffBaseShape,
    phoneNumber: phoneSchema,
    email: emailSchema,
    password: strongPasswordSchema,
    roleId: z.string().uuid("roleId must be a valid UUID").optional(),
    roleName: z.string().trim().min(1).max(50).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.roleId || value.roleName), {
    message: "Either roleId or roleName is required",
    path: ["roleId"],
  });

export const updateStaffSchema = z.object(staffBaseShape).partial().strict();

export const listStaffQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    hubId: z.string().uuid("hubId must be a valid UUID").optional(),
    status: staffStatusSchema.optional(),
    department: z.string().trim().min(1).max(100).optional(),
  });

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type ListStaffQuery = z.infer<typeof listStaffQuerySchema>;
