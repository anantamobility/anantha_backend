import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  createCollectionSchema,
  listCollectionsQuerySchema,
} from "../validation/collection.js";
import {
  createCollection,
  getCollectionById,
  getCollections,
} from "../controllers/collection/collection.controller.js";

const r = Router();

// Commented for route review + frontend integration.
// Uncomment one route at a time after review.
//need another review with reomval of nested helpers
// r.post(
//   "/",
//   verifyToken,
//   authorize("collection", "create"),
//   validate(createCollectionSchema),
//   createCollection
// );

// r.get(
//   "/",
//   verifyToken,
//   authorize("collection", "read", { policy: false }),
//   validate(listCollectionsQuerySchema, "query"),
//   getCollections
// );

// r.get(
//   "/:id",
//   verifyToken,
//   validate(idParamSchema, "params"),
//   authorize("collection", "read"),
//   getCollectionById
// );

export default r;
