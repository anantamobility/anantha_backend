import { Router } from "express";
import { authorize } from "../middleware/pbac.js";
import { addRole, getRolesAndPerms, updatePermsOnRole } from "../controllers/users/pbac.js";
import { verifyToken } from "../middleware/verifyToken.js";


const r = Router()
r.get("/rolesAndPermissions",verifyToken, authorize("role","read",{policy:false}), getRolesAndPerms)
r.put("/:id",verifyToken, authorize("role","assign_perm",{lookupField:"id"}), updatePermsOnRole)
r.post("/addRole", verifyToken, authorize("role","create", {lookupField: "id"}), addRole)
export default r
