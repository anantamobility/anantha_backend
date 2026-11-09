import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  approveResponsibilitySchema,
  awaitPartsSchema,
  assignReplacementSchema,
  cancelServiceSchema,
  closeServiceSchema,
  completeServiceSchema,
  createServiceChargeSchema,
  createServiceSchema,
  listServicesQuerySchema,
  resumeServiceSchema,
  returnReplacementSchema,
  startServiceSchema,
  updateServiceSchema,
} from "../validation/service.js";
import {
  approveResponsibility,
  assignReplacement,
  cancelService,
  closeService,
  completeService,
  createService,
  createServiceCharge,
  getServiceById,
  getServices,
  markAwaitingParts,
  resumeServiceWork,
  returnReplacement,
  startService,
  updateService,
} from "../controllers/service/service.controller.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("service", "create"),
  validate(createServiceSchema),
  createService
);
r.get(
  "/",
  verifyToken,
  authorize("service", "read", { policy: false }),
  validate(listServicesQuerySchema, "query"),
  getServices
);

r.patch(
  "/:id/start",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "start"),
  validate(startServiceSchema),
  startService
);
r.patch(
  "/:id/awaiting-parts",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "await-parts"),
  validate(awaitPartsSchema),
  markAwaitingParts
);
r.patch(
  "/:id/resume",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "resume"),
  validate(resumeServiceSchema),
  resumeServiceWork
);
r.patch(
  "/:id/complete",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "complete"),
  validate(completeServiceSchema),
  completeService
);
r.patch(
  "/:id/close",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "close"),
  validate(closeServiceSchema),
  closeService
);
r.patch(
  "/:id/cancel",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "cancel"),
  validate(cancelServiceSchema),
  cancelService
);
r.post(
  "/:id/approve-responsibility",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "approve-responsibility"),
  validate(approveResponsibilitySchema),
  approveResponsibility
);
r.post(
  "/:id/replacement",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "assign-replacement"),
  validate(assignReplacementSchema),
  assignReplacement
);
r.post(
  "/:id/replacement/return",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "return-replacement"),
  validate(returnReplacementSchema),
  returnReplacement
);
r.post(
  "/:id/charges",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "charge:manage"),
  validate(createServiceChargeSchema),
  createServiceCharge
);

r.patch(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "update"),
  validate(updateServiceSchema),
  updateService
);

r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("service", "read"),
  getServiceById
);

export default r;
