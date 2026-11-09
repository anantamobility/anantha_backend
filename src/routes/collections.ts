import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  clearCollectionSchema,
  createCollectionSchema,
  listCollectionsQuerySchema,
} from "../validation/collection.js";
import {
  clearCollection,
  createCollection,
  getCollectionById,
  getCollections,
} from "../controllers/collection/collection.controller.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("collection", "create"),
  validate(createCollectionSchema),
  createCollection
);
r.get(
  "/",
  verifyToken,
  authorize("collection", "read", { policy: false }),
  validate(listCollectionsQuerySchema, "query"),
  getCollections
);
r.patch(
  "/:id/clear",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("collection", "update"),
  validate(clearCollectionSchema),
  clearCollection
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("collection", "read"),
  getCollectionById
);

export default r;
