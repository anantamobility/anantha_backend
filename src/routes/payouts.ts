import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  createPayoutSchema,
  listPayoutsQuerySchema,
} from "../validation/payout.js";
import {
  createPayout,
  getPayoutById,
  getPayouts,
} from "../controllers/payout/payout.controller.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("payout", "create"),
  validate(createPayoutSchema),
  createPayout
);
r.get(
  "/",
  verifyToken,
  authorize("payout", "read", { policy: false }),
  validate(listPayoutsQuerySchema, "query"),
  getPayouts
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("payout", "read"),
  getPayoutById
);

export default r;
