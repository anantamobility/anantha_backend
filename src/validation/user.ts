import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";
import { validatePasswordStrength } from "./auth.js";

export const accountStatusSchema = z.enum([
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
]);

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, "phoneNumber must contain 7 to 15 digits");

export const emailSchema = z
  .string()
  .trim()
  .email("email must be a valid email address")
  .max(254)
  .nullable()
  .optional();

export const strongPasswordSchema = z
  .string()
  .min(1, "password is required")
  .superRefine((value, ctx) => {
    const message = validatePasswordStrength(value);
    if (message) ctx.addIssue({ code: "custom", message });
  });

export const updateUserSchema = z
  .object({
    phoneNumber: phoneSchema.optional(),
    email: emailSchema,
  })
  .strict();

export const assignUserRoleSchema = z
  .object({
    roleId: z.string().uuid("roleId must be a valid UUID"),
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const changeUserStatusSchema = z
  .object({
    status: accountStatusSchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const listUsersQuerySchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend({
    roleId: z.string().uuid("roleId must be a valid UUID").optional(),
    status: accountStatusSchema.optional(),
    sortBy: z
      .enum(["email", "phoneNumber", "status", "createdAt", "updatedAt"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AssignUserRoleInput = z.infer<typeof assignUserRoleSchema>;
export type ChangeUserStatusInput = z.infer<typeof changeUserStatusSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
