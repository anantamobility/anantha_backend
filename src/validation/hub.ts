import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";

const optionalNullableString = (max: number) =>
  z.string().trim().min(1).max(max).nullable().optional();

export const createHubSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(150),
  code: z.string().trim().min(1, "code is required").max(30),
  address: z.json().nullable().optional(),
  contactPhone: optionalNullableString(20),
  contactEmail: z
    .string()
    .trim()
    .email("contactEmail must be a valid email")
    .max(255)
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
});

export const updateHubSchema = createHubSchema.partial();

export const listHubsQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    isActive: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  });

export type CreateHubInput = z.infer<typeof createHubSchema>;
export type UpdateHubInput = z.infer<typeof updateHubSchema>;
export type ListHubsQuery = z.infer<typeof listHubsQuerySchema>;
