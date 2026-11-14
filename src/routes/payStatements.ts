import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  approvePayStatementSchema,
  generatePayStatementSchema,
  listPayStatementsQuerySchema,
} from "../validation/payStatement.js";
import { payStatementSchema } from "../validation/payout.js";
import {
  approvePayStatement,
  generatePayStatement,
  getPayStatementById,
  getPayStatements,
  payStatement,
} from "../controllers/payStatement/payStatement.controller.js";

const r = Router();

r.post(
  "/generate",
  verifyToken,
  authorize("payStatement", "generate", { policy: false }),
  validate(generatePayStatementSchema),
  generatePayStatement
);
r.get(
  "/",
  verifyToken,
  authorize("payStatement", "read", { policy: false }),
  validate(listPayStatementsQuerySchema, "query"),
  getPayStatements
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("payStatement", "read"),
  getPayStatementById
);
r.post(
  "/:id/approve",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("payStatement", "approve"),
  validate(approvePayStatementSchema),
  approvePayStatement
);
r.post(
  "/:id/pay",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("payStatement", "pay"),
  validate(payStatementSchema),
  payStatement
);

export default r;
