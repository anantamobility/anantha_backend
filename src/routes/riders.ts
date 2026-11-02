import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { createRider, getRiders, getRiderById, updateRider } from "../controllers/rider/riders.js";
import { createRiderSchema, updateRiderSchema } from "../validation/rider.js";
import { validate } from "../middleware/validate.js";

const r = Router()

r.post("/", verifyToken, authorize("rider", "create"), validate(createRiderSchema), createRider)
r.get("/", verifyToken, authorize("rider", "read", { policy: false }), getRiders)
r.get("/:id", verifyToken, authorize("rider", "read"), getRiderById)
r.put("/:id", verifyToken, authorize("rider", "update"), validate(updateRiderSchema), updateRider)

export default r
