import { z } from "zod";
import { paginationQuerySchema } from "./common.js";

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

const positiveQuantity = z
  .number()
  .int("quantity must be an integer")
  .positive("quantity must be greater than 0");

const movementTypeSchema = z.enum([
  "OPENING_STOCK",
  "PURCHASE_IN",
  "SERVICE_CONSUMPTION",
  "MANUAL_ADJUSTMENT",
  "SERVICE_RETURN",
  "DAMAGED_STOCK",
]);

const baseMovementFields = {
  spareId: z.string().uuid("spareId must be a valid UUID"),
  hubId: z.string().uuid("hubId must be a valid UUID"),
  quantity: positiveQuantity,
  unitCost: moneySchema(4, "unitCost").nullable().optional(),
  movedAt: z.coerce.date().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
  notes: z.string().trim().min(1).max(2000).nullable().optional(),
};

export const openingStockSchema = z
  .object({
    ...baseMovementFields,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const stockInSchema = z
  .object({
    ...baseMovementFields,
    referenceType: z.string().trim().min(1).max(100).nullable().optional(),
    referenceId: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .strict();

export const adjustStockSchema = z
  .object({
    ...baseMovementFields,
    direction: z.enum(["IN", "OUT"]),
    reason: z.string().trim().min(1, "reason is required for adjustments").max(500),
  })
  .strict();

export const serviceConsumptionSchema = z
  .object({
    serviceId: z.string().uuid("serviceId must be a valid UUID"),
    spareId: z.string().uuid("spareId must be a valid UUID"),
    hubId: z.string().uuid("hubId must be a valid UUID").optional(),
    quantity: positiveQuantity,
    unitCost: moneySchema(4, "unitCost").nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

export const serviceReturnSchema = z
  .object({
    serviceId: z.string().uuid("serviceId must be a valid UUID"),
    spareId: z.string().uuid("spareId must be a valid UUID"),
    hubId: z.string().uuid("hubId must be a valid UUID"),
    quantity: positiveQuantity,
    unitCost: moneySchema(4, "unitCost").nullable().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
    notes: z.string().trim().min(1).max(2000).nullable().optional(),
  })
  .strict();

export const damagedStockSchema = z
  .object({
    ...baseMovementFields,
    reason: z.string().trim().min(1, "reason is required for damaged stock").max(500),
  })
  .strict();

export const listInventoryBalancesQuerySchema = paginationQuerySchema.extend({
  spareId: z.string().uuid("spareId must be a valid UUID").optional(),
  hubId: z.string().uuid("hubId must be a valid UUID").optional(),
  lowStock: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  sortBy: z
    .enum(["spareId", "hubId", "onHand", "updatedAt"])
    .default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const listInventoryMovementsQuerySchema = paginationQuerySchema.extend({
  spareId: z.string().uuid("spareId must be a valid UUID").optional(),
  hubId: z.string().uuid("hubId must be a valid UUID").optional(),
  serviceId: z.string().uuid("serviceId must be a valid UUID").optional(),
  movementType: movementTypeSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortBy: z.enum(["movedAt", "quantity", "createdAt"]).default("movedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const listLowStockQuerySchema = paginationQuerySchema.extend({
  hubId: z.string().uuid("hubId must be a valid UUID").optional(),
});

export type OpeningStockInput = z.infer<typeof openingStockSchema>;
export type StockInInput = z.infer<typeof stockInSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type ServiceConsumptionInput = z.infer<typeof serviceConsumptionSchema>;
export type ServiceReturnInput = z.infer<typeof serviceReturnSchema>;
export type DamagedStockInput = z.infer<typeof damagedStockSchema>;
export type ListInventoryBalancesQuery = z.infer<
  typeof listInventoryBalancesQuerySchema
>;
export type ListInventoryMovementsQuery = z.infer<
  typeof listInventoryMovementsQuerySchema
>;
export type ListLowStockQuery = z.infer<typeof listLowStockQuerySchema>;

export const spareHubParamsSchema = z.object({
  spareId: z.string().uuid("spareId must be a valid UUID"),
  hubId: z.string().uuid("hubId must be a valid UUID"),
});

export const spareIdParamsSchema = z.object({
  spareId: z.string().uuid("spareId must be a valid UUID"),
});
