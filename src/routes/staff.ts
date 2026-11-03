import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  createStaffSchema,
  listStaffQuerySchema,
  updateStaffSchema,
} from "../validation/staff.js";
import {
  createStaff,
  deleteStaff,
  getStaff,
  getStaffById,
  updateStaff,
} from "../controllers/staff/staff.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("staff", "create"),
  validate(createStaffSchema),
  createStaff
);
r.get(
  "/",
  verifyToken,
  authorize("staff", "read", { policy: false }),
  validate(listStaffQuerySchema, "query"),
  getStaff
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("staff", "read"),
  getStaffById
);
r.patch(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("staff", "update"),
  validate(updateStaffSchema),
  updateStaff
);
r.put(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("staff", "update"),
  validate(updateStaffSchema),
  updateStaff
);
r.delete(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("staff", "delete"),
  deleteStaff
);

export default r;
