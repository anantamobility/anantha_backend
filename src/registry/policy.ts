import type { ResourcePolicies } from "../types/user.js"; 
import { UserPolicies } from "./policies/user.js";
import { RolePolicies } from "./policies/role.js";

// --- MAIN REGISTRY EXPORT ---
// Keys must match Prisma Model names (lowercase usually, depending on your setup)
export const PolicyRegistry: Record<string, ResourcePolicies> = {
    user: UserPolicies,
    role: RolePolicies
};
