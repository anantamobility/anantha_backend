import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  changeRateCardStatusSchema,
  createRateCardSchema,
  listRateCardsQuerySchema,
  updateRateCardSchema,
} from "../validation/ratecard.js";
import {
  changeRateCardStatus,
  createRateCard,
  deleteRateCard,
  getRateCardById,
  getRateCards,
  updateRateCard,
} from "../controllers/ratecard/ratecard.controller.js";
import { getRateCardClients } from "../controllers/ratecard/ratecard-assignment.controller.js";
import { listRateCardClientsQuerySchema } from "../validation/ratecardAssignment.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("ratecard", "create"),
  validate(createRateCardSchema),
  createRateCard
);
r.get(
  "/",
  verifyToken,
  authorize("ratecard", "read", { policy: false }),
  validate(listRateCardsQuerySchema, "query"),
  getRateCards
);
r.get(
  "/:id/clients",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("ratecardAssignment", "read", { policy: false }),
  validate(listRateCardClientsQuerySchema, "query"),
  getRateCardClients
);
r.patch(
  "/:id/status",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("ratecard", "status:update"),
  validate(changeRateCardStatusSchema),
  changeRateCardStatus
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("ratecard", "read"),
  getRateCardById
);
r.patch(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("ratecard", "update"),
  validate(updateRateCardSchema),
  updateRateCard
);
r.put(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("ratecard", "update"),
  validate(updateRateCardSchema),
  updateRateCard
);
r.delete(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("ratecard", "delete"),
  deleteRateCard
);

export default r;
