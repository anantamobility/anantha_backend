import { z } from "zod";
import { istDateSchema, paginationQuerySchema } from "./common.js";
import {
  paymentMethodSchema,
  rentalDueStatusSchema,
} from "./collection.js";

export const generateClientDuesSchema = z
  .object({
    throughDate: istDateSchema
      .optional()
      .refine((value) => !value || value.getTime() <= Date.now(), {
        message: "throughDate cannot be in the future",
      }),
  })
  .strict()
  .default({});

export const listClientDuesQuerySchema = paginationQuerySchema.extend({
  status: rentalDueStatusSchema.optional(),
  rentalId: z.string().uuid("rentalId must be a valid UUID").optional(),
  sortBy: z
    .enum(["dueDate", "periodStart", "periodEnd", "status", "createdAt"])
    .default("dueDate"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export const listClientCollectionsQuerySchema = paginationQuerySchema.extend({
  paymentMethod: paymentMethodSchema.optional(),
  rentalId: z.string().uuid("rentalId must be a valid UUID").optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sortBy: z
    .enum(["receivedAt", "amount", "createdAt", "updatedAt"])
    .default("receivedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type GenerateClientDuesInput = z.infer<typeof generateClientDuesSchema>;
export type ListClientDuesQuery = z.infer<typeof listClientDuesQuerySchema>;
export type ListClientCollectionsQuery = z.infer<
  typeof listClientCollectionsQuerySchema
>;
