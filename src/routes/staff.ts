import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { createStaff, getStaff, getStaffById, updateStaff } from "../controllers/staff/staff.js";
import { createStaffSchema, updateStaffSchema } from "../validation/staff.js";
import { validate } from "../middleware/validate.js";

const r = Router()

r.post("/", verifyToken, authorize("staff", "create"), validate(createStaffSchema), createStaff)
r.get("/", verifyToken, authorize("staff", "read", { policy: false }), getStaff)
r.get("/:id", verifyToken, authorize("staff", "read"), getStaffById)
r.put("/:id", verifyToken, authorize("staff", "update"), validate(updateStaffSchema), updateStaff)

export default r
