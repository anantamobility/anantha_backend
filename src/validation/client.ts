import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

export const clientTypeSchema = z.enum(["INDIVIDUAL", "CORPORATE"]);

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

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
  type: clientTypeSchema,
  name: z.string().trim().min(1, "name is required").max(200),
  companyName: optionalNullableString(200),
  contactPerson: optionalNullableString(150),
  email: emailSchema,
  phoneNumber: phoneNumberSchema.nullable().optional(),
  taxId: optionalNullableString(50),
  billingAddress: z.json().nullable().optional(),
  paymentTermsDays: z
    .number()
    .int("paymentTermsDays must be an integer")
    .min(0, "paymentTermsDays cannot be negative")
    .max(365, "paymentTermsDays cannot exceed 365")
    .nullable()
    .optional(),
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
    type: clientTypeSchema.optional(),
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

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
export type ChangeClientStatusInput = z.infer<
  typeof changeClientStatusSchema
>;
