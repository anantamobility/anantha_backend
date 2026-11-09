import { z } from "zod";
import { paginationQuerySchema } from "./common.js";

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

export const receiveDepositSchema = z
  .object({
    amount: moneySchema(2, "amount"),
    reference: z.string().trim().min(1).max(200).nullable().optional(),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const refundDepositSchema = z
  .object({
    amount: moneySchema(2, "amount"),
    reference: z.string().trim().min(1).max(200).nullable().optional(),
    reason: z.string().trim().min(1).max(500).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const adjustDepositSchema = z
  .object({
    amount: moneySchema(2, "amount"),
    direction: z.enum(["CREDIT", "DEBIT"]),
    reason: z.string().trim().min(1).max(500),
    reference: z.string().trim().min(1).max(200).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const depositLedgerQuerySchema = paginationQuerySchema;

export type ReceiveDepositInput = z.infer<typeof receiveDepositSchema>;
export type RefundDepositInput = z.infer<typeof refundDepositSchema>;
export type AdjustDepositInput = z.infer<typeof adjustDepositSchema>;
export type DepositLedgerQuery = z.infer<typeof depositLedgerQuerySchema>;
