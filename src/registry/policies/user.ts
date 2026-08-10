import type { ResourcePolicies } from "../../types/user.js";

export const UserPolicies: ResourcePolicies = {
    // 1. Who can view a user record? (GET /users/:id)
    'read': (user, targetUser) => {
        // Admin can view anyone
        if (user.role === 'ADMIN') return true;

        // Users can view their own account details
        if (user.id === targetUser.id) return true;

        return false;
    },

    // 2. Who can update a user? (PUT /users/:id)
    'update': (user, targetUser) => {
        if (user.role === 'ADMIN') return true;

        // Users can update their own data (e.g. password, email)
        if (user.id === targetUser.id) return true;
        
        return false;
    },

    // 3. Who can delete a user? (DELETE /users/:id)
    'delete': (user, targetUser) => {
        // Only Admins can delete accounts (Hard Delete)
        return user.role === 'ADMIN';
    }
};
