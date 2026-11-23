import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";
import { paymentMethodSchema } from "./collection.js";

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

export const payStatementStatusSchema = z.enum([
  "DRAFT",
  "PENDING_APPROVAL",
  "PAYABLE",
  "APPROVED",
  "PAID",
  "FAILED",
  "RECONCILED",
  "REVERSED",
]);

export const statementCycleSchema = z.enum(["SAME_DAY", "NEXT_DAY"]);

export const manualDeductionSchema = z
  .object({
    lineType: z.enum(["DEPOSIT_DEDUCTION", "OTHER_DEDUCTION"]),
    amount: moneySchema(2, "amount"),
    description: z.string().trim().min(1).max(500),
    rentalId: z.string().uuid("rentalId must be a valid UUID").nullable().optional(),
    depositId: z.string().uuid("depositId must be a valid UUID").optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.lineType === "DEPOSIT_DEDUCTION" && !value.depositId) {
      ctx.addIssue({
        code: "custom",
        path: ["depositId"],
        message: "depositId is required for a deposit deduction",
      });
    }
    if (value.lineType !== "DEPOSIT_DEDUCTION" && value.depositId) {
      ctx.addIssue({
        code: "custom",
        path: ["depositId"],
        message: "depositId is only valid for a deposit deduction",
      });
    }
  });

export const generatePayStatementSchema = z
  .object({
    riderId: z.string().uuid("riderId must be a valid UUID"),
    date: z.coerce.date().optional(),
    cycle: statementCycleSchema.optional(),
    periodStart: z.coerce.date().optional(),
    periodEnd: z.coerce.date().optional(),
    manualDeductions: z.array(manualDeductionSchema).max(20).optional(),
    notes: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasRange = value.periodStart !== undefined || value.periodEnd !== undefined;
    if (hasRange && (!value.periodStart || !value.periodEnd)) {
      ctx.addIssue({
        code: "custom",
        path: ["periodStart"],
        message: "periodStart and periodEnd must be supplied together",
      });
    }
    if (hasRange && value.date) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: "date cannot be combined with periodStart/periodEnd",
      });
    }
    if (!hasRange && !value.date) {
      ctx.addIssue({
        code: "custom",
        path: ["date"],
        message: "either date or periodStart/periodEnd is required",
      });
    }
    if (
      value.periodStart &&
      value.periodEnd &&
      value.periodEnd.getTime() <= value.periodStart.getTime()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "periodEnd must be later than periodStart",
      });
    }
  });

export const listPayStatementsQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    riderId: z.string().uuid("riderId must be a valid UUID").optional(),
    status: payStatementStatusSchema.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sortBy: z
      .enum(["periodStart", "periodEnd", "netPayable", "status", "createdAt"])
      .default("periodStart"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export const payStatementPaymentSchema = z
  .object({
    paymentMethod: paymentMethodSchema,
    referenceNumber: z.string().trim().min(1).max(200).nullable().optional(),
    paidAt: z.coerce.date().optional(),
    notes: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

export type GeneratePayStatementInput = z.infer<typeof generatePayStatementSchema>;
export type ListPayStatementsQuery = z.infer<typeof listPayStatementsQuerySchema>;
export type PayStatementPaymentInput = z.infer<typeof payStatementPaymentSchema>;
export type PayStatementStatusValue = z.infer<typeof payStatementStatusSchema>;
