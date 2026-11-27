import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  deployInSchema,
  deployOutSchema,
  listDeploymentsQuerySchema,
} from "../validation/deployment.js";
import {
  deploymentIn,
  deploymentOut,
  getDeploymentById,
  getDeployments,
} from "../controllers/deployment/deployment.js";

const r = Router();

r.post(
  "/deploy-out",
  verifyToken,
  authorize("rental", "assign"),
  validate(deployOutSchema),
  deploymentOut
);

r.post(
  "/:id/deploy-in",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rental", "close"),
  validate(deployInSchema),
  deploymentIn
);

r.get(
  "/",
  verifyToken,
  authorize("rental", "read", { policy: false }),
  validate(listDeploymentsQuerySchema, "query"),
  getDeployments
);

r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rental", "read"),
  getDeploymentById
);

export default r;
