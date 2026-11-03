import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  changeVehicleStatusSchema,
  createVehicleSchema,
  listVehicleStatusHistoryQuerySchema,
  listVehiclesQuerySchema,
  updateVehicleSchema,
} from "../validation/vehicle.js";
import {
  changeVehicleStatus,
  createVehicle,
  deleteVehicle,
  getVehicleById,
  getVehicleStatusHistory,
  getVehicles,
  updateVehicle,
} from "../controllers/vehicle/vehicles.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("vehicle", "create"),
  validate(createVehicleSchema),
  createVehicle
);
r.get(
  "/",
  verifyToken,
  authorize("vehicle", "read", { policy: false }),
  validate(listVehiclesQuerySchema, "query"),
  getVehicles
);
r.get(
  "/:id/status-history",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("vehicle", "history:read"),
  validate(listVehicleStatusHistoryQuerySchema, "query"),
  getVehicleStatusHistory
);
r.patch(
  "/:id/status",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("vehicle", "status:update"),
  validate(changeVehicleStatusSchema),
  changeVehicleStatus
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("vehicle", "read"),
  getVehicleById
);
r.patch(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("vehicle", "update"),
  validate(updateVehicleSchema),
  updateVehicle
);
r.put(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("vehicle", "update"),
  validate(updateVehicleSchema),
  updateVehicle
);
r.delete(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("vehicle", "delete"),
  deleteVehicle
);

export default r;
