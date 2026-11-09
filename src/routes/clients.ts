import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  changeClientStatusSchema,
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
} from "../validation/client.js";
import { listClientRateCardsQuerySchema } from "../validation/ratecardAssignment.js";
import {
  changeClientStatus,
  createClient,
  getClientById,
  getClients,
  updateClient,
} from "../controllers/client/client.controller.js";
import { getClientRateCards } from "../controllers/ratecard/ratecard-assignment.controller.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("client", "create"),
  validate(createClientSchema),
  createClient
);
r.get(
  "/",
  verifyToken,
  authorize("client", "read", { policy: false }),
  validate(listClientsQuerySchema, "query"),
  getClients
);
r.get(
  "/:id/ratecards",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("ratecardAssignment", "read", { policy: false }),
  validate(listClientRateCardsQuerySchema, "query"),
  getClientRateCards
);
r.patch(
  "/:id/status",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("client", "status:update"),
  validate(changeClientStatusSchema),
  changeClientStatus
);
r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("client", "read"),
  getClientById
);
r.patch(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("client", "update"),
  validate(updateClientSchema),
  updateClient
);
r.put(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("client", "update"),
  validate(updateClientSchema),
  updateClient
);

export default r;
