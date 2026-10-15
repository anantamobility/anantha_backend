import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { createDriver, getDrivers, getDriverById, updateDriver } from "../controllers/driver/drivers.js";
import { createVehicleSchema, updateVehicleSchema } from "../validation/vehicle.js";
import { validate } from "../middleware/validate.js";

const r = Router()

r.post("/", verifyToken, authorize("driver", "create"), validate(createVehicleSchema),  createDriver)
r.get("/", verifyToken, authorize("driver", "read", { policy: false }), getDrivers)
r.get("/:id", verifyToken, authorize("driver", "read"), getDriverById)
r.put("/:id", verifyToken, authorize("driver", "update"), validate(updateVehicleSchema), updateDriver)

export default r