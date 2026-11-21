import { z } from "zod";
import {
  genderSchema,
  pastDateSchema,
} from "./common.js";
import {
  b2bRiderMgmtSchema,
  b2cModeSchema,
  rentalTypeSchema,
} from "./rider.js";

/**
 * Rider import contract (create-only):
 * - Excel uses hubCode / clientCode (not UUIDs).
 * - No password column — server generates temp passwords on import.
 * - No status / documents / userId.
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

const optionalCode = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .nullable()
  .optional();

export const riderImportRowSchema = z
  .object({
    fullName: z.string().trim().min(1, "fullName is required").max(150),
    phoneNumber: phoneNumberSchema,
    email: emailSchema,
    riderCode: z.string().trim().min(1).max(50).optional(),
    dateOfBirth: pastDateSchema,
    gender: genderSchema.nullable().optional(),
    addressLine1: optionalNullableString(200),
    addressLine2: optionalNullableString(200),
    addressCity: optionalNullableString(100),
    addressState: optionalNullableString(100),
    addressPostalCode: optionalNullableString(20),
    addressCountry: optionalNullableString(100),
    emergencyContactName: optionalNullableString(150),
    emergencyContactPhone: phoneNumberSchema.nullable().optional(),
    aadharNumber: optionalNullableString(20),
    panNumber: optionalNullableString(20),
    licenseNumber: optionalNullableString(30),
    medicalReportExpiryDate: z.coerce.date().nullable().optional(),
    agreementDate: z.coerce.date().nullable().optional(),
    policeVerificationValidUpto: z.coerce.date().nullable().optional(),
    backgroundVerificationExpiryDate: z.coerce.date().nullable().optional(),
    dateOfLastWorkingDay: z.coerce.date().nullable().optional(),
    bankName: optionalNullableString(100),
    branch: optionalNullableString(100),
    rentalType: rentalTypeSchema,
    b2cMode: b2cModeSchema.nullable().optional(),
    b2bRiderMgmt: b2bRiderMgmtSchema.nullable().optional(),
    hubCode: optionalCode,
    clientCode: optionalCode,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.rentalType === "B2C") {
      if (!value.b2cMode) {
        ctx.addIssue({
          code: "custom",
          path: ["b2cMode"],
          message: "b2cMode is required for B2C riders",
        });
      }
      if (value.b2bRiderMgmt) {
        ctx.addIssue({
          code: "custom",
          path: ["b2bRiderMgmt"],
          message: "b2bRiderMgmt is not applicable to B2C riders",
        });
      }
    }

    if (value.rentalType === "B2B") {
      if (!value.b2bRiderMgmt) {
        ctx.addIssue({
          code: "custom",
          path: ["b2bRiderMgmt"],
          message: "b2bRiderMgmt is required for B2B riders",
        });
      }
      if (!value.clientCode) {
        ctx.addIssue({
          code: "custom",
          path: ["clientCode"],
          message: "clientCode is required for B2B riders",
        });
      }
      if (value.b2cMode) {
        ctx.addIssue({
          code: "custom",
          path: ["b2cMode"],
          message: "b2cMode is not applicable to B2B riders",
        });
      }
    }
  });

export const riderImportBodySchema = z
  .object({
    rows: z
      .array(riderImportRowSchema)
      .min(1, "rows must contain at least one row")
      .max(500, "rows cannot exceed 500"),
  })
  .strict();

export type RiderImportRowInput = z.infer<typeof riderImportRowSchema>;
export type RiderImportBody = z.infer<typeof riderImportBodySchema>;
