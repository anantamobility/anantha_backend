import { z } from "zod";

export const idParamSchema = z.object({
  id: z.string().uuid("id must be a valid UUID"),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "page must be at least 1").default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, "limit must be at least 1")
    .max(100, "limit must be at most 100")
    .default(20),
});

export const searchQuerySchema = z.object({
  search: z.string().trim().min(1).max(150).optional(),
});
