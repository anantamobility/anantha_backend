import { Router } from "express";
import { authorize } from "../middleware/pbac.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import { assignRolePermissionsSchema, createRoleSchema, renameRoleSchema } from "../validation/pbac.js";
import { addRole, getRolesAndPerms, renameRole, updatePermsOnRole } from "../controllers/users/pbac.js";

const r = Router();

r.get("/rolesAndPermissions", verifyToken, authorize("role", "read", { policy: false }), getRolesAndPerms);
r.post("/addRole", verifyToken, authorize("role", "create"), validate(createRoleSchema), addRole );
r.patch("/:id/rename", verifyToken, validate(idParamSchema, "params"), authorize("role", "edit"), validate(renameRoleSchema), renameRole);
r.put("/:id/permissions", verifyToken, validate(idParamSchema, "params"), authorize("role", "assign_perm"), validate(assignRolePermissionsSchema), updatePermsOnRole);

export default r;
