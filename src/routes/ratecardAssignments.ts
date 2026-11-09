import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  createRateCardAssignmentSchema,
  listRateCardAssignmentsQuerySchema,
  unassignRateCardAssignmentSchema,
  updateRateCardAssignmentSchema,
} from "../validation/ratecardAssignment.js";
import {
  createRateCardAssignment,
  getRateCardAssignmentById,
  getRateCardAssignments,
  unassignRateCard,
  updateRateCardAssignment,
} from "../controllers/ratecard/ratecard-assignment.controller.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("ratecardAssignment", "create"),
  validate(createRateCardAssignmentSchema),
  createRateCardAssignment
);
r.get(
  "/",
  verifyToken,
  authorize("ratecardAssignment", "read", { policy: false }),
  validate(listRateCardAssignmentsQuerySchema, "query"),
  getRateCardAssignments
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("ratecardAssignment", "read"),
  getRateCardAssignmentById
);
r.patch(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("ratecardAssignment", "update"),
  validate(updateRateCardAssignmentSchema),
  updateRateCardAssignment
);
r.delete(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("ratecardAssignment", "delete"),
  validate(unassignRateCardAssignmentSchema),
  unassignRateCard
);

export default r;
