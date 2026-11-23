import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

export const ledgerEntryTypeSchema = z.enum([
  "RENT_CHARGED",
  "COLLECTION_RECEIVED",
  "DELIVERY_PAY",
  "RENT_DEDUCTION",
  "DEPOSIT_DEDUCTION",
  "PAYOUT",
  "REVERSAL",
  "OTHER",
  "INCENTIVE",
  "REIMBURSEMENT",
  "ADVANCE",
  "ADVANCE_RECOVERY",
]);

export const ledgerDirectionSchema = z.enum(["CREDIT", "DEBIT"]);

export const deliveryPaySchema = z
  .object({
    riderId: z.string().uuid("riderId must be a valid UUID"),
    amount: z
      .union([z.string(), z.number()])
      .transform((value) =>
        typeof value === "number" ? String(value) : value.trim()
      )
      .refine(
        (value) => /^\d+(\.\d{1,2})?$/.test(value),
        "amount must be a non-negative decimal with at most 2 decimal places"
      )
      .refine((value) => Number(value) > 0, "amount must be greater than 0"),
    occurredAt: z.coerce.date().optional(),
    reference: z.string().trim().min(1).max(200).nullable().optional(),
    description: z.string().trim().min(1).max(500).nullable().optional(),
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

export type DeliveryPayInput = z.infer<typeof deliveryPaySchema>;
export type ListLedgerQuery = z.infer<typeof listLedgerQuerySchema>;
export type LedgerSummaryQuery = z.infer<typeof ledgerSummaryQuerySchema>;
