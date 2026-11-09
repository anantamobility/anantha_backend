import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

export const riderStatusSchema = z.enum([
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
  "TERMINATED",
]);

export const rentalTypeSchema = z.enum(["B2C", "B2B"]);
export const b2cModeSchema = z.enum(["AML_RIDER", "INDIVIDUAL_RIDER"]);
export const b2bRiderMgmtSchema = z.enum(["CLIENT_MANAGED", "AML_MANAGED"]);
export const genderSchema = z.enum([
  "MALE",
  "FEMALE",
  "OTHER",
  "PREFER_NOT_TO_SAY",
]);

export const verificationTypeSchema = z.enum(["PVC", "BGV"]);

export const documentTypeSchema = z.enum([
  "ID_PROOF",
  "ADDRESS_PROOF",
  "DRIVING_LICENSE",
  "VEHICLE_PERMIT",
  "INSURANCE",
  "REGISTRATION",
  "CONTRACT",
  "PVC",
  "BGV",
  "OTHER",
]);

const optionalNullableUuid = (field: string) =>
  z.string().uuid(`${field} must be a valid UUID`).nullable().optional();

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

const phoneNumberSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[0-9]{7,15}$/,
    "phoneNumber must contain 7 to 15 digits, optionally prefixed with +"
  );

const optionalPhoneNumber = phoneNumberSchema.nullable().optional();

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .email("email must be a valid email address")
  .nullable()
  .optional();

const addressSchema = z
  .object({
    line1: z.string().trim().min(1).max(200).optional(),
    line2: z.string().trim().min(1).max(200).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    state: z.string().trim().min(1).max(100).optional(),
    postalCode: z.string().trim().min(1).max(20).optional(),
    country: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .nullable()
  .optional();

const dateOfBirthSchema = z.coerce
  .date()
  .refine((value) => value.getTime() <= Date.now(), {
    message: "dateOfBirth cannot be in the future",
  })
  .nullable()
  .optional();

const riderBaseShape = {
  fullName: z.string().trim().min(1, "fullName is required").max(150),
  userId: optionalNullableUuid("userId"),
  riderCode: z.string().trim().min(1).max(50).optional(),
  phoneNumber: phoneNumberSchema,
  email: emailSchema,
  dateOfBirth: dateOfBirthSchema,
  gender: genderSchema.nullable().optional(),
  address: addressSchema,
  emergencyContactName: optionalNullableString(150),
  emergencyContactPhone: optionalPhoneNumber,
  rentalType: rentalTypeSchema,
  b2cMode: b2cModeSchema.nullable().optional(),
  b2bRiderMgmt: b2bRiderMgmtSchema.nullable().optional(),
  clientId: optionalNullableUuid("clientId"),
  hubId: optionalNullableUuid("hubId"),
};

function validateClassification(
  value: {
    rentalType?: "B2C" | "B2B" | null;
    b2cMode?: "AML_RIDER" | "INDIVIDUAL_RIDER" | null;
    b2bRiderMgmt?: "CLIENT_MANAGED" | "AML_MANAGED" | null;
    clientId?: string | null;
  },
  ctx: z.RefinementCtx
) {
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
    if (!value.clientId) {
      ctx.addIssue({
        code: "custom",
        path: ["clientId"],
        message: "clientId is required for B2B riders",
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
}

export const createRiderSchema = z
  .object(riderBaseShape)
  .strict()
  .superRefine(validateClassification);

export const updateRiderSchema = z
  .object(riderBaseShape)
  .partial()
  .strict();

export const listRidersQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    status: riderStatusSchema.optional(),
    rentalType: rentalTypeSchema.optional(),
    b2cMode: b2cModeSchema.optional(),
    b2bRiderMgmt: b2bRiderMgmtSchema.optional(),
    clientId: z.string().uuid("clientId must be a valid UUID").optional(),
    hubId: z.string().uuid("hubId must be a valid UUID").optional(),
    sortBy: z
      .enum([
        "fullName",
        "riderCode",
        "status",
        "rentalType",
        "createdAt",
        "updatedAt",
      ])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export const changeRiderStatusSchema = z
  .object({
    status: riderStatusSchema,
    reason: z.string().trim().min(1).max(500).optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const listRiderStatusHistoryQuerySchema = paginationQuerySchema
  .extend({
    status: riderStatusSchema.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    sortBy: z.enum(["changedAt", "status"]).default("changedAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (query) =>
      !query.startDate ||
      !query.endDate ||
      query.startDate.getTime() <= query.endDate.getTime(),
    {
      message: "startDate must be before or equal to endDate",
      path: ["startDate"],
    }
  );

export const verificationTypeParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
  type: verificationTypeSchema,
});

export const submitVerificationSchema = z
  .object({
    documentIds: z.array(z.string().uuid("documentIds must be valid UUIDs")).max(20).optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const approveVerificationSchema = z
  .object({
    notes: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const rejectVerificationSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(1, "reason is required when rejecting a verification")
      .max(1000),
    notes: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const riderDocumentMetadataSchema = z
  .object({
    documentType: documentTypeSchema,
    title: z.string().trim().min(1, "title is required").max(200),
    issueDate: z.coerce.date().nullable().optional(),
    expiryDate: z.coerce.date().nullable().optional(),
    verificationType: verificationTypeSchema.optional(),
    notes: z.string().trim().min(1).max(1000).optional(),
  })
  .strict();

export const listRiderDocumentsQuerySchema = paginationQuerySchema.extend({
  documentType: documentTypeSchema.optional(),
});

export const riderDocumentParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
  documentId: z.string().uuid("documentId must be a valid UUID"),
});

export type CreateRiderInput = z.infer<typeof createRiderSchema>;
export type UpdateRiderInput = z.infer<typeof updateRiderSchema>;
export type ListRidersQuery = z.infer<typeof listRidersQuerySchema>;
export type ChangeRiderStatusInput = z.infer<typeof changeRiderStatusSchema>;
export type ListRiderStatusHistoryQuery = z.infer<
  typeof listRiderStatusHistoryQuerySchema
>;
export type SubmitVerificationInput = z.infer<
  typeof submitVerificationSchema
>;
export type ApproveVerificationInput = z.infer<
  typeof approveVerificationSchema
>;
export type RejectVerificationInput = z.infer<typeof rejectVerificationSchema>;
export type RiderDocumentMetadata = z.infer<
  typeof riderDocumentMetadataSchema
>;
export type ListRiderDocumentsQuery = z.infer<
  typeof listRiderDocumentsQuerySchema
>;
