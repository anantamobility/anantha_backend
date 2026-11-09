import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

const decimalString = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "number" ? String(value) : value.trim()));

function moneySchema(scale: number, label: string, positive = false) {
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

const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter ISO code")
  .transform((value) => value.toUpperCase());

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

const skuSchema = z
  .string()
  .trim()
  .min(1, "sku is required")
  .max(100, "sku must be at most 100 characters")
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "sku may contain only letters, numbers, '.', '_' and '-'"
  );

const quantitySchema = z
  .number()
  .int("quantity must be an integer")
  .min(0, "quantity cannot be negative");

export const createSpareSchema = z
  .object({
    sku: skuSchema,
    name: z.string().trim().min(1, "name is required").max(200),
    category: optionalNullableString(100),
    description: optionalNullableString(2000),
    unitOfMeasure: z.string().trim().min(1).max(30).optional(),
    purchasePrice: moneySchema(4, "purchasePrice").nullable().optional(),
    unitCost: moneySchema(4, "unitCost"),
    minimumStock: quantitySchema.optional(),
    currency: currencySchema.optional(),
  })
  .strict();

export const updateSpareSchema = z
  .object({
    sku: skuSchema.optional(),
    name: z.string().trim().min(1).max(200).optional(),
    category: optionalNullableString(100),
    description: optionalNullableString(2000),
    unitOfMeasure: z.string().trim().min(1).max(30).optional(),
    purchasePrice: moneySchema(4, "purchasePrice").nullable().optional(),
    unitCost: moneySchema(4, "unitCost").optional(),
    minimumStock: quantitySchema.optional(),
    currency: currencySchema.optional(),
  })
  .strict();

export const changeSpareStatusSchema = z
  .object({
    isActive: z.boolean(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const listSparesQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    category: z.string().trim().min(1).max(100).optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    sortBy: z
      .enum(["sku", "name", "category", "minimumStock", "createdAt", "updatedAt"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export type CreateSpareInput = z.infer<typeof createSpareSchema>;
export type UpdateSpareInput = z.infer<typeof updateSpareSchema>;
export type ChangeSpareStatusInput = z.infer<typeof changeSpareStatusSchema>;
export type ListSparesQuery = z.infer<typeof listSparesQuerySchema>;
