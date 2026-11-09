import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  changeSpareStatusSchema,
  createSpareSchema,
  listSparesQuerySchema,
  updateSpareSchema,
} from "../validation/spare.js";
import {
  changeSpareStatus,
  createSpare,
  getSpareById,
  getSpares,
  updateSpare,
} from "../controllers/spare/spare.controller.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("spare", "create"),
  validate(createSpareSchema),
  createSpare
);
r.get(
  "/",
  verifyToken,
  authorize("spare", "read", { policy: false }),
  validate(listSparesQuerySchema, "query"),
  getSpares
);

r.patch(
  "/:id/status",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("spare", "status:update"),
  validate(changeSpareStatusSchema),
  changeSpareStatus
);

r.patch(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("spare", "update"),
  validate(updateSpareSchema),
  updateSpare
);

r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("spare", "read"),
  getSpareById
);

export default r;
