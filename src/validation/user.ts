import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";
import { validatePasswordStrength } from "./auth.js";

export const accountStatusSchema = z.enum([
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
]);

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, "phoneNumber must contain 7 to 15 digits");

const emailSchema = z
  .string()
  .trim()
  .email("email must be a valid email address")
  .max(254)
  .nullable()
  .optional();

const strongPasswordSchema = z
  .string()
  .min(1, "password is required")
  .superRefine((value, ctx) => {
    const message = validatePasswordStrength(value);
    if (message) ctx.addIssue({ code: "custom", message });
  });

export const createUserSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(150),
    phoneNumber: phoneSchema,
    email: emailSchema,
    password: strongPasswordSchema,
    roleId: z.string().uuid("roleId must be a valid UUID").optional(),
    roleName: z.string().trim().min(1).max(50).optional(),
    status: accountStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Boolean(value.roleId || value.roleName), {
    message: "Either roleId or roleName is required",
    path: ["roleId"],
  });

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
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
      .enum(["name", "email", "phoneNumber", "status", "createdAt", "updatedAt"])
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type AssignUserRoleInput = z.infer<typeof assignUserRoleSchema>;
export type ChangeUserStatusInput = z.infer<typeof changeUserStatusSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
