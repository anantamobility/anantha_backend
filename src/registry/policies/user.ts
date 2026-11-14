import type { ResourcePolicies } from "../../types/user.js";

function isAdmin(user: { role: string }) {
  return user.role === "ADMIN";
}

export const UserPolicies: ResourcePolicies = {
  // 1. Who can view a user record? (GET /users/:id)
  read: (user, targetUser) => {
    if (isAdmin(user)) return true;
    // Users can view their own account details.
    return user.id === targetUser.id;
  },

  // 2. Who can update a user's basic profile? (PUT /users/:id)
  update: (user, targetUser) => {
    if (isAdmin(user)) return true;
    // Non-admins may only edit their own profile fields. Role and status
    // changes are protected by separate permissions.
    return user.id === targetUser.id;
  },

  // 3. Administrative account lifecycle operations are admin-only. The
  // service layer additionally prevents self-demotion, self-deactivation and
  // removal of the last active administrator.
  "role:assign": (user) => isAdmin(user),
  "status:update": (user) => isAdmin(user),
  "session:revoke": (user) => isAdmin(user),
  resetPassword: (user) => isAdmin(user),
  delete: (user) => isAdmin(user),
};
