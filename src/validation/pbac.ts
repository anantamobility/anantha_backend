import { z } from "zod";

const roleNameSchema = z
	.string()
	.trim()
	.min(2, "role name must be at least 2 characters")
	.max(50, "role name cannot exceed 50 characters");

export const assignRolePermissionsSchema = z
	.object({
		permissions: z.array(z.string().uuid("permissions must contain permission ids")),
	})
	.strict();

export const createRoleSchema = z
	.object({
		newRoleName: roleNameSchema,
	})
	.strict();

export const renameRoleSchema = z
	.object({
		name: roleNameSchema,
	})
	.strict();

export type AssignRolePermissionsInput = z.infer<typeof assignRolePermissionsSchema>;
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type RenameRoleInput = z.infer<typeof renameRoleSchema>;
