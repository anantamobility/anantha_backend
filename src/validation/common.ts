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

export const genderSchema = z.enum([
  "MALE",
  "FEMALE",
  "OTHER",
  "PREFER_NOT_TO_SAY",
]);

export const addressSchema = z
  .object({
    line1: z.string().trim().min(1).max(200).optional(),
    line2: z.string().trim().min(1).max(200).optional(),
    city: z.string().trim().min(1).max(100).optional(),
    state: z.string().trim().min(1).max(100).optional(),
    postalCode: z.string().trim().min(1).max(20).optional(),
    country: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .nullable()
  .optional();

export const pastDateSchema = z.coerce
  .date()
  .refine((value) => value.getTime() <= Date.now(), {
    message: "date cannot be in the future",
  })
  .nullable()
  .optional();

