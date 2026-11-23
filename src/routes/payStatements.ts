import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import applyIdempotency from "../middleware/idempotency.js";
import { idParamSchema } from "../validation/common.js";
import {
  generatePayStatementSchema,
  listPayStatementsQuerySchema,
  payStatementPaymentSchema,
} from "../validation/payStatement.js";
import {
  generatePayStatement,
  getPayStatementById,
  getPayStatements,
  payStatement,
} from "../controllers/payStatement/payStatement.controller.js";

const r = Router();

r.post(
  "/generate",
  verifyToken,
  authorize("riderPayStatement", "generate", { policy: false }),
  validate(generatePayStatementSchema),
  applyIdempotency(),
  generatePayStatement
);
r.get(
  "/",
  verifyToken,
  authorize("riderPayStatement", "read", { policy: false }),
  validate(listPayStatementsQuerySchema, "query"),
  getPayStatements
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("riderPayStatement", "read"),
  getPayStatementById
);
r.post(
  "/:id/pay",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("riderPayStatement", "pay"),
  validate(payStatementPaymentSchema),
  applyIdempotency(),
  payStatement
);

export default r;
