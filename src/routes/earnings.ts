import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import {
  adjustEarningSchema,
  earningsSummaryQuerySchema,
  listEarningsQuerySchema,
  recordEarningSchema,
} from "../validation/earnings.js";
import {
  adjustEarning,
  getEarnings,
  getEarningsSummary,
  recordEarning,
} from "../controllers/earnings/earnings.controller.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("earning", "create"),
  validate(recordEarningSchema),
  recordEarning
);
r.post(
  "/adjustments",
  verifyToken,
  authorize("earning", "adjust", { policy: false }),
  validate(adjustEarningSchema),
  adjustEarning
);
r.get(
  "/summary",
  verifyToken,
  authorize("earning", "read", { policy: false }),
  validate(earningsSummaryQuerySchema, "query"),
  getEarningsSummary
);
r.get(
  "/",
  verifyToken,
  authorize("earning", "read", { policy: false }),
  validate(listEarningsQuerySchema, "query"),
  getEarnings
);

export default r;
