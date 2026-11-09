import { z } from "zod";
import { paginationQuerySchema } from "./common.js";
import {
  collectionStatusSchema,
  paymentMethodSchema,
  rentalDueStatusSchema,
} from "./collection.js";

const decimalString = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "number" ? String(value) : value.trim()));

function moneySchema(scale: number, label: string) {
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
    .refine((value) => Number(value) > 0, `${label} must be greater than 0`);
}

export const generateClientDuesSchema = z
  .object({
    throughDate: z.coerce.date().optional(),
  })
  .strict()
  .default({});

export const recordClientPaymentSchema = z
  .object({
    amount: moneySchema(2, "amount"),
    paymentMethod: paymentMethodSchema,
    referenceNumber: z.string().trim().min(1).max(200).nullable().optional(),
    receivedAt: z.coerce.date().optional(),
    rentalId: z.string().uuid("rentalId must be a valid UUID").nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

export const listClientDuesQuerySchema = paginationQuerySchema.extend({
  status: rentalDueStatusSchema.optional(),
  rentalId: z.string().uuid("rentalId must be a valid UUID").optional(),
  sortBy: z
    .enum(["dueDate", "periodStart", "periodEnd", "status", "createdAt"])
    .default("dueDate"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const listClientCollectionsQuerySchema = paginationQuerySchema.extend({
  status: collectionStatusSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  rentalId: z.string().uuid("rentalId must be a valid UUID").optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortBy: z
    .enum(["receivedAt", "amount", "status", "createdAt", "updatedAt"])
    .default("receivedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type GenerateClientDuesInput = z.infer<typeof generateClientDuesSchema>;
export type RecordClientPaymentInput = z.infer<typeof recordClientPaymentSchema>;
export type ListClientDuesQuery = z.infer<typeof listClientDuesQuerySchema>;
export type ListClientCollectionsQuery = z.infer<
  typeof listClientCollectionsQuerySchema
>;
