import { z } from "zod";
import { genderSchema, pastDateSchema } from "./common.js";
import {
  employmentTypeSchema,
  staffStatusSchema,
  workModeSchema,
} from "./staff.js";

/**
 * Staff import contract (create-only):
 * - Excel uses hubCode / roleName (not UUIDs).
 * - No password column — server generates temp passwords on import.
 * - roleName must resolve to ADMIN or SUPERVISOR (RIDER rejected in service).
 * - ADMIN assignment still requires actor ADMIN (enforced in createStaff).
 * - Address is flattened into addressLine1..country then assembled in the service.
 */

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

const phoneNumberSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[0-9]{7,15}$/,
    "phoneNumber must contain 7 to 15 digits, optionally prefixed with +",
  );

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .email("email must be a valid email address")
  .nullable()
  .optional();

const optionalCode = z.string().trim().min(1).max(50).nullable().optional();

export const staffImportRowSchema = z
  .object({
    fullName: z.string().trim().min(1, "fullName is required").max(150),
    gender: genderSchema,
    phoneNumber: phoneNumberSchema,
    roleName: z.string().trim().min(1, "roleName is required").max(50),
    email: emailSchema,
    hubCode: optionalCode,
    employeeCode: optionalNullableString(50),
    dateOfBirth: pastDateSchema,
    department: optionalNullableString(100),
    jobTitle: optionalNullableString(100),
    status: staffStatusSchema.optional(),
    employmentType: employmentTypeSchema.nullable().optional(),
    workMode: workModeSchema.nullable().optional(),
    educationalQualification: optionalNullableString(150),
    bloodGroup: optionalNullableString(10),
    addressLine1: optionalNullableString(200),
    addressLine2: optionalNullableString(200),
    addressCity: optionalNullableString(100),
    addressState: optionalNullableString(100),
    addressPostalCode: optionalNullableString(20),
    addressCountry: optionalNullableString(100),
    alternatePhone: phoneNumberSchema.nullable().optional(),
    emergencyContactName: optionalNullableString(150),
    emergencyContactPhone: phoneNumberSchema.nullable().optional(),
    anniversary: z.coerce.date().nullable().optional(),
    dateOfJoining: z.coerce.date().nullable().optional(),
    probationEndDate: z.coerce.date().nullable().optional(),
    dateOfLastWorkingDay: z.coerce.date().nullable().optional(),
    dateOfRelieving: z.coerce.date().nullable().optional(),
    aadharNumber: optionalNullableString(20),
    panNumber: optionalNullableString(20),
    bankName: optionalNullableString(100),
    branch: optionalNullableString(100),
    bankAccountNumber: optionalNullableString(34),
    bankIfsc: optionalNullableString(20),
    bankHolderName: optionalNullableString(150),
  })
  .strict();

export const staffImportBodySchema = z
  .object({
    rows: z
      .array(staffImportRowSchema)
      .min(1, "rows must contain at least one row")
      .max(500, "rows cannot exceed 500"),
  })
  .strict();

export type StaffImportRowInput = z.infer<typeof staffImportRowSchema>;
export type StaffImportBody = z.infer<typeof staffImportBodySchema>;
