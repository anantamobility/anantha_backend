import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { dashboardQuerySchema } from "../validation/dashboard.js";
import { getDashboardSummary } from "../controllers/dashboard.js";

const r = Router();

r.get(
  "/",
  verifyToken,
  authorize("dashboard", "read", { policy: false }),
  validate(dashboardQuerySchema, "query"),
  getDashboardSummary
);

export default r;
