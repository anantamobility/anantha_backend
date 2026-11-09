import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

export const rentalTypeSchema = z.enum(["B2C", "B2B"]);
export const billingFrequencySchema = z.enum([
  "WEEKLY",
  "FORTNIGHTLY",
  "MONTHLY",
]);

const rateCardCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "code may only contain letters, digits, hyphens and underscores"
  );

const decimalString = z
  .union([z.string(), z.number()])
  .transform((value) => (typeof value === "number" ? String(value) : value.trim()));

function moneySchema(
  scale: number,
  label: string,
  options: { positive?: boolean } = {}
) {
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  return decimalString
    .refine(
      (value) => pattern.test(value),
      `${label} must be a non-negative decimal with at most ${scale} decimal places`
    )
    .refine(
      (value) => Number(value) <= 9_999_999_999.9999,
      `${label} is too large`
    )
    .refine(
      (value) => !options.positive || Number(value) > 0,
      `${label} must be greater than 0`
    );
}

const rateCardBaseShape = {
  code: rateCardCodeSchema.optional(),
  name: z.string().trim().min(1, "name is required").max(200),
  description: z.string().trim().min(1).max(2000).nullable().optional(),
  vehicleCategory: z
    .string()
    .trim()
    .min(1)
    .max(100, "vehicleCategory cannot exceed 100 characters")
    .nullable()
    .optional(),
  rentalType: rentalTypeSchema.nullable().optional(),
  billingFrequency: billingFrequencySchema.nullable().optional(),
  dailyRate: moneySchema(4, "dailyRate", { positive: true }),
  weeklyRate: moneySchema(4, "weeklyRate").nullable().optional(),
  fortnightlyRate: moneySchema(4, "fortnightlyRate").nullable().optional(),
  monthlyRate: moneySchema(4, "monthlyRate").nullable().optional(),
  securityDeposit: moneySchema(2, "securityDeposit").nullable().optional(),
  currency: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter ISO code")
    .transform((value) => value.toUpperCase())
    .optional(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
  terms: z.json().nullable().optional(),
  isActive: z.boolean().optional(),
};

function validateDateRange(
  value: { effectiveFrom?: Date; effectiveTo?: Date | null },
  ctx: z.RefinementCtx
) {
  if (
    value.effectiveTo &&
    value.effectiveFrom &&
    value.effectiveTo.getTime() <= value.effectiveFrom.getTime()
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["effectiveTo"],
      message: "effectiveTo must be later than effectiveFrom",
    });
  }
}

export const createRateCardSchema = z
  .object(rateCardBaseShape)
  .strict()
  .superRefine(validateDateRange);

// code is an immutable business identifier, and lifecycle status is changed
// only through the dedicated status endpoint.
export const updateRateCardSchema = z
  .object(rateCardBaseShape)
  .omit({ code: true, isActive: true })
  .partial()
  .strict();

export const listRateCardsQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    vehicleCategory: z
      .string()
      .trim()
      .min(1)
      .max(100, "vehicleCategory cannot exceed 100 characters")
      .optional(),
    rentalType: rentalTypeSchema.optional(),
    billingFrequency: billingFrequencySchema.optional(),
    isActive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    validOn: z.coerce.date().optional(),
    sortBy: z
      .enum([
        "code",
        "name",
        "effectiveFrom",
        "effectiveTo",
        "dailyRate",
        "createdAt",
        "updatedAt",
      ])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export const changeRateCardStatusSchema = z
  .object({
    isActive: z.boolean(),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type CreateRateCardInput = z.infer<typeof createRateCardSchema>;
export type UpdateRateCardInput = z.infer<typeof updateRateCardSchema>;
export type ListRateCardsQuery = z.infer<typeof listRateCardsQuerySchema>;
export type ChangeRateCardStatusInput = z.infer<
  typeof changeRateCardStatusSchema
>;
