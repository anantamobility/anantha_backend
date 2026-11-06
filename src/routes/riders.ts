import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { uploadRiderDocument } from "../middleware/upload.js";
import { idParamSchema } from "../validation/common.js";
import {
  approveVerificationSchema,
  changeRiderStatusSchema,
  createRiderSchema,
  listRiderDocumentsQuerySchema,
  listRiderStatusHistoryQuerySchema,
  listRidersQuerySchema,
  rejectVerificationSchema,
  riderDocumentMetadataSchema,
  riderDocumentParamSchema,
  submitVerificationSchema,
  updateRiderSchema,
  verificationTypeParamSchema,
} from "../validation/rider.js";
import {
  changeRiderStatus,
  createRider,
  getRiderById,
  getRiderStatusHistory,
  getRiders,
  updateRider,
} from "../controllers/rider/riders.js";
import {
  deleteRiderDocument,
  downloadRiderDocument,
  getRiderDocument,
  listRiderDocuments,
  uploadRiderDocument as uploadRiderDocumentController,
} from "../controllers/rider/rider-document.controller.js";
import {
  approveRiderVerification,
  getRiderVerification,
  listRiderVerifications,
  rejectRiderVerification,
  submitRiderVerification,
} from "../controllers/rider/rider-verification.controller.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("rider", "create"),
  validate(createRiderSchema),
  createRider
);
r.get(
  "/",
  verifyToken,
  authorize("rider", "read", { policy: false }),
  validate(listRidersQuerySchema, "query"),
  getRiders
);

r.get(
  "/:id/status-history",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rider", "history:read"),
  validate(listRiderStatusHistoryQuerySchema, "query"),
  getRiderStatusHistory
);
r.patch(
  "/:id/status",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rider", "status:update"),
  validate(changeRiderStatusSchema),
  changeRiderStatus
);

// Documents
r.post(
  "/:id/documents",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rider", "document:upload"),
  uploadRiderDocument,
  validate(riderDocumentMetadataSchema),
  uploadRiderDocumentController
);
r.get(
  "/:id/documents",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rider", "document:read"),
  validate(listRiderDocumentsQuerySchema, "query"),
  listRiderDocuments
);
r.get(
  "/:id/documents/:documentId/download",
  verifyToken,
  validate(riderDocumentParamSchema, "params"),
  authorize("rider", "document:read"),
  downloadRiderDocument
);
r.get(
  "/:id/documents/:documentId",
  verifyToken,
  validate(riderDocumentParamSchema, "params"),
  authorize("rider", "document:read"),
  getRiderDocument
);
r.delete(
  "/:id/documents/:documentId",
  verifyToken,
  validate(riderDocumentParamSchema, "params"),
  authorize("rider", "document:delete"),
  deleteRiderDocument
);

// PVC / BGV verifications
r.get(
  "/:id/verifications",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rider", "verification:read"),
  listRiderVerifications
);
r.get(
  "/:id/verifications/:type",
  verifyToken,
  validate(verificationTypeParamSchema, "params"),
  authorize("rider", "verification:read"),
  getRiderVerification
);
r.post(
  "/:id/verifications/:type/submit",
  verifyToken,
  validate(verificationTypeParamSchema, "params"),
  authorize("rider", "verification:submit"),
  validate(submitVerificationSchema),
  submitRiderVerification
);
r.post(
  "/:id/verifications/:type/approve",
  verifyToken,
  validate(verificationTypeParamSchema, "params"),
  authorize("rider", "verification:review"),
  validate(approveVerificationSchema),
  approveRiderVerification
);
r.post(
  "/:id/verifications/:type/reject",
  verifyToken,
  validate(verificationTypeParamSchema, "params"),
  authorize("rider", "verification:review"),
  validate(rejectVerificationSchema),
  rejectRiderVerification
);

r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rider", "read"),
  getRiderById
);
r.patch(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rider", "update"),
  validate(updateRiderSchema),
  updateRider
);
r.put(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rider", "update"),
  validate(updateRiderSchema),
  updateRider
);

export default r;
