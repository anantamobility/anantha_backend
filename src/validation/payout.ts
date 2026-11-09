import { z } from "zod";
import { paginationQuerySchema } from "./common.js";

export const payoutStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED",
]);

export const createPayoutSchema = z
  .object({
    settlementId: z.string().uuid("settlementId must be a valid UUID"),
    paymentMethod: z.enum([
      "CASH",
      "UPI",
      "CARD",
      "BANK_TRANSFER",
      "CHEQUE",
      "OTHER",
    ]),
    referenceNumber: z.string().trim().min(1).max(200).nullable().optional(),
    paidAt: z.coerce.date().optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

export const listPayoutsQuerySchema = paginationQuerySchema.extend({
  settlementId: z.string().uuid("settlementId must be a valid UUID").optional(),
  riderId: z.string().uuid("riderId must be a valid UUID").optional(),
  status: payoutStatusSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortBy: z
    .enum(["paidAt", "amount", "status", "createdAt"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const paySettlementSchema = createPayoutSchema.omit({
  settlementId: true,
});

export type CreatePayoutInput = z.infer<typeof createPayoutSchema>;
export type PaySettlementInput = z.infer<typeof paySettlementSchema>;
export type ListPayoutsQuery = z.infer<typeof listPayoutsQuerySchema>;
