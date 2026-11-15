import type { ResourcePolicies } from "../../types/user.js";

const isAdmin = (user: { role: string }) => user.role === "ADMIN";

export const RolePolicies: ResourcePolicies = {
	read: (user) => isAdmin(user),
	edit: (user) => isAdmin(user),
	assign_perm: (user) => isAdmin(user),
	delete: (user) => isAdmin(user),
};
