import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

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

export const paymentMethodSchema = z.enum([
  "CASH",
  "UPI",
  "CARD",
  "BANK_TRANSFER",
  "CHEQUE",
  "OTHER",
]);

export const collectionStatusSchema = z.enum([
  "PENDING",
  "CLEARED",
  "FAILED",
  "REFUNDED",
  "REVERSED",
]);

export const rentalDueStatusSchema = z.enum([
  "PENDING",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
]);

export const createCollectionSchema = z
  .object({
    rentalId: z.string().uuid("rentalId must be a valid UUID"),
    amount: moneySchema(2, "amount"),
    paymentMethod: paymentMethodSchema,
    referenceNumber: z.string().trim().min(1).max(200).nullable().optional(),
    receivedAt: z.coerce.date().optional(),
    status: z.enum(["PENDING", "CLEARED"]).optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

export const listCollectionsQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    rentalId: z.string().uuid("rentalId must be a valid UUID").optional(),
    clientId: z.string().uuid("clientId must be a valid UUID").optional(),
    riderId: z.string().uuid("riderId must be a valid UUID").optional(),
    status: collectionStatusSchema.optional(),
    paymentMethod: paymentMethodSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sortBy: z
      .enum(["receivedAt", "amount", "status", "createdAt", "updatedAt"])
      .default("receivedAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export const listRentalCollectionsQuerySchema = paginationQuerySchema.extend({
  status: collectionStatusSchema.optional(),
  sortBy: z
    .enum(["receivedAt", "amount", "status", "createdAt", "updatedAt"])
    .default("receivedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const listRentalDuesQuerySchema = paginationQuerySchema.extend({
  status: rentalDueStatusSchema.optional(),
  sortBy: z
    .enum(["dueDate", "periodStart", "periodEnd", "status", "createdAt"])
    .default("dueDate"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const generateDuesSchema = z
  .object({
    throughDate: z.coerce.date().optional(),
  })
  .strict()
  .default({});

export const clearCollectionSchema = z
  .object({
    reconciledAt: z.coerce.date().optional(),
  })
  .strict()
  .default({});

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type ListCollectionsQuery = z.infer<typeof listCollectionsQuerySchema>;
export type ListRentalCollectionsQuery = z.infer<
  typeof listRentalCollectionsQuerySchema
>;
export type ListRentalDuesQuery = z.infer<typeof listRentalDuesQuerySchema>;
export type GenerateDuesInput = z.infer<typeof generateDuesSchema>;
export type ClearCollectionInput = z.infer<typeof clearCollectionSchema>;
