import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  createHubSchema,
  listHubsQuerySchema,
  updateHubSchema,
} from "../validation/hub.js";
import {
  createHub,
  deleteHub,
  getHubById,
  getHubs,
  updateHub,
} from "../controllers/hub/hubs.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("hub", "create"),
  validate(createHubSchema),
  createHub
);
r.get(
  "/",
  verifyToken,
  authorize("hub", "read", { policy: false }),
  validate(listHubsQuerySchema, "query"),
  getHubs
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("hub", "read"),
  getHubById
);
r.patch(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("hub", "update"),
  validate(updateHubSchema),
  updateHub
);
r.put(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("hub", "update"),
  validate(updateHubSchema),
  updateHub
);
r.delete(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("hub", "delete"),
  deleteHub
);

export default r;
