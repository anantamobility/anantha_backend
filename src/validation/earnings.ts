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

export const ledgerEntryTypeSchema = z.enum([
  "DELIVERY_EARNING",
  "RENT_DEDUCTION",
  "DEPOSIT_DEDUCTION",
  "ADJUSTMENT",
  "PAYOUT",
  "REVERSAL",
  "OTHER",
]);

export const ledgerDirectionSchema = z.enum(["CREDIT", "DEBIT"]);

export const recordLedgerSchema = z
  .object({
    riderId: z.string().uuid("riderId must be a valid UUID"),
    rentalId: z.string().uuid("rentalId must be a valid UUID").nullable().optional(),
    amount: moneySchema(2, "amount"),
    occurredAt: z.coerce.date().optional(),
    description: z.string().trim().min(1).max(500).optional(),
    referenceNumber: z.string().trim().min(1).max(200).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export const adjustLedgerSchema = z
  .object({
    riderId: z.string().uuid("riderId must be a valid UUID"),
    rentalId: z.string().uuid("rentalId must be a valid UUID").nullable().optional(),
    amount: moneySchema(2, "amount"),
    direction: ledgerDirectionSchema,
    reason: z.string().trim().min(1).max(500),
    occurredAt: z.coerce.date().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export const listLedgerQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    riderId: z.string().uuid("riderId must be a valid UUID").optional(),
    rentalId: z.string().uuid("rentalId must be a valid UUID").optional(),
    payStatementId: z.string().uuid("payStatementId must be a valid UUID").optional(),
    entryType: ledgerEntryTypeSchema.optional(),
    direction: ledgerDirectionSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sortBy: z
      .enum(["occurredAt", "amount", "entryType", "createdAt"])
      .default("occurredAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export const ledgerSummaryQuerySchema = z.object({
  riderId: z.string().uuid("riderId must be a valid UUID"),
});

export type RecordLedgerInput = z.infer<typeof recordLedgerSchema>;
export type AdjustLedgerInput = z.infer<typeof adjustLedgerSchema>;
export type ListLedgerQuery = z.infer<typeof listLedgerQuerySchema>;
export type LedgerSummaryQuery = z.infer<typeof ledgerSummaryQuerySchema>;
