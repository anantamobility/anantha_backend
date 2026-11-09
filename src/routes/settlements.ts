import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  approveSettlementSchema,
  generateSettlementSchema,
  listSettlementsQuerySchema,
} from "../validation/settlement.js";
import { paySettlementSchema } from "../validation/payout.js";
import {
  approveSettlement,
  generateSettlement,
  getSettlementById,
  getSettlements,
  paySettlement,
} from "../controllers/settlement/settlement.controller.js";

const r = Router();

r.post(
  "/generate",
  verifyToken,
  authorize("settlement", "generate", { policy: false }),
  validate(generateSettlementSchema),
  generateSettlement
);
r.get(
  "/",
  verifyToken,
  authorize("settlement", "read", { policy: false }),
  validate(listSettlementsQuerySchema, "query"),
  getSettlements
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("settlement", "read"),
  getSettlementById
);
r.post(
  "/:id/approve",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("settlement", "approve"),
  validate(approveSettlementSchema),
  approveSettlement
);
r.post(
  "/:id/pay",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("settlement", "pay"),
  validate(paySettlementSchema),
  paySettlement
);

export default r;
