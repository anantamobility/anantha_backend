import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  assignUserRoleSchema,
  changeUserStatusSchema,
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
} from "../validation/user.js";
import {
  assignUserRole,
  changeUserStatus,
  createUser,
  deleteUser,
  getUserById,
  getUsers,
  revokeUserSessions,
  updateUser,
} from "../controllers/users/users.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("user", "create"),
  validate(createUserSchema),
  createUser
);
r.get(
  "/",
  verifyToken,
  authorize("user", "read", { policy: false }),
  validate(listUsersQuerySchema, "query"),
  getUsers
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("user", "read"),
  getUserById
);
r.patch(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("user", "update"),
  validate(updateUserSchema),
  updateUser
);
r.put(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("user", "update"),
  validate(updateUserSchema),
  updateUser
);
r.patch(
  "/:id/role",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("user", "role:assign"),
  validate(assignUserRoleSchema),
  assignUserRole
);
r.patch(
  "/:id/status",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("user", "status:update"),
  validate(changeUserStatusSchema),
  changeUserStatus
);
r.post(
  "/:id/revoke-sessions",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("user", "session:revoke"),
  revokeUserSessions
);
r.delete(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("user", "delete"),
  deleteUser
);

export default r;
