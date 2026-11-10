import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { listAuditLogsQuerySchema } from "../validation/auditLog.js";
import { getAuditLogs } from "../controllers/users/auditLog.js";

const r = Router();

r.get(
  "/",
  verifyToken,
  authorize("auditLog", "read", { policy: false }),
  validate(listAuditLogsQuerySchema, "query"),
  getAuditLogs
);

export default r;
