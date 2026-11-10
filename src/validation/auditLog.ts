import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

export const listAuditLogsQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    userId: z.string().uuid("userId must be a valid UUID").optional(),
    resource: z.string().trim().min(1).max(100).optional(),
    action: z.string().trim().min(1).max(100).optional(),
    status: z.enum(["SUCCESS", "FAILURE"]).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  })
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    "from must be before or equal to to"
  );

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
