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

export type ListLedgerQuery = z.infer<typeof listLedgerQuerySchema>;
