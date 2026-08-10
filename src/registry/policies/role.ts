import type { ResourcePolicies } from "../../types/user.js";

export const RolePolicies: ResourcePolicies = {
    'read': (user, targetRole)=>{
        if (user.role==="ADMIN"){
            return true
        }
        return false
    },
    "assign_perm": (user, targetRole) => {
        if (user.role==="ADMIN"){
            return true
        }
        return false
    }
}
