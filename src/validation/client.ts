import { z } from "zod";
import { idParamSchema, paginationQuerySchema, searchQuerySchema } from "./common.js";

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

const decimalString = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "number" ? String(value) : value.trim()));

function moneySchema(scale: number, label: string, positive = true) {
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

const phoneNumberSchema = z
  .string()
  .trim()
  .regex(
    /^\+?[0-9]{7,15}$/,
    "phoneNumber must contain 7 to 15 digits, optionally prefixed with +"
  );

const emailSchema = z
  .string()
  .trim()
  .max(254)
  .email("email must be a valid email address")
  .nullable()
  .optional();

const clientCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "clientCode may only contain letters, digits, hyphens and underscores"
  );

const clientBaseShape = {
  clientCode: clientCodeSchema.optional(),
  name: z.string().trim().min(1, "name is required").max(200),
  companyName: optionalNullableString(200),
  contactPerson: optionalNullableString(150),
  email: emailSchema,
  phoneNumber: phoneNumberSchema.nullable().optional(),
  isActive: z.boolean().optional(),
};

export const createClientSchema = z.object(clientBaseShape).strict();

// clientCode is an immutable business identifier, and lifecycle status is
// changed only through the dedicated status endpoint.
export const updateClientSchema = z
  .object(clientBaseShape)
  .omit({ clientCode: true, isActive: true })
  .partial()
  .strict();

export const listClientsQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    isActive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    sortBy: z
      .enum(["name", "clientCode", "createdAt", "updatedAt"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export const changeClientStatusSchema = z
  .object({
    isActive: z.boolean(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

// Optional counters on a contract; null clears a previously set value.
const optionalCount = z.number().int().min(0).nullable().optional();

const clientContractBaseShape = {
  contractNumber: z.string().trim().min(1).max(50),
  hubId: z.string().uuid("hubId must be a valid UUID").nullable().optional(),
  riderManagement: z.enum(["CLIENT_MANAGED", "AML_MANAGED"]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  vehicleCount: z
    .number()
    .int()
    .positive("vehicleCount must be greater than 0"),
  vehicleModels: z
    .array(z.string().trim().min(1).max(100))
    .min(1, "vehicleModels must list at least one model")
    .max(50),
  dailyRate: moneySchema(4, "dailyRate"),
  securityDeposit: moneySchema(2, "securityDeposit").nullable().optional(),
  billingFrequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY"]),
  minBillingDays: optionalCount,
  graceDays: optionalCount,
  paymentTermsDays: optionalCount,
  replacementRules: optionalNullableString(2000),
  downtimeRules: optionalNullableString(2000),
  damageRecoveryRules: optionalNullableString(2000),
  taxDetails: z.json().nullable().optional(),
  notes: optionalNullableString(2000),
};

export const createClientContractSchema = z
  .object(clientContractBaseShape)
  .strict();

// contractNumber is the contract's business identifier, so it is immutable
// after creation just like clientCode.
export const updateClientContractSchema = z
  .object(clientContractBaseShape)
  .omit({ contractNumber: true })
  .partial()
  .strict();

export const clientContractParamsSchema = idParamSchema.extend({
  contractId: z.string().uuid("contractId must be a valid UUID"),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
export type ChangeClientStatusInput = z.infer<
  typeof changeClientStatusSchema
>;
export type CreateClientContractInput = z.infer<
  typeof createClientContractSchema
>;
export type UpdateClientContractInput = z.infer<
  typeof updateClientContractSchema
>;
