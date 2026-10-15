import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { createVehicle, getVehicles, getVehicleById, updateVehicle } from "../controllers/vehicle/vehicles.js";
import { createVehicleSchema, updateVehicleSchema } from "../validation/vehicle.js";
import { validate } from "../middleware/validate.js";

const r = Router()

r.post("/", verifyToken, authorize("vehicle", "create"),validate(createVehicleSchema),  createVehicle)
r.get("/", verifyToken, authorize("vehicle", "read", { policy: false }), getVehicles)
r.get("/:id", verifyToken, authorize("vehicle", "read"), getVehicleById)
r.put("/:id", verifyToken, authorize("vehicle", "update"), validate(updateVehicleSchema), updateVehicle)

export default r