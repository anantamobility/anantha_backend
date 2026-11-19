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

const r = Router();

r.post("/", verifyToken, authorize("rateCard", "create"), validate(createRateCardSchema), createRateCard);
r.get("/",verifyToken,authorize("rateCard", "read", { policy: false }),validate(listRateCardsQuerySchema, "query"),getRateCards);
r.patch( "/:id/status", verifyToken, validate(idParamSchema, "params"), authorize("rateCard", "status:update"), validate(changeRateCardStatusSchema), changeRateCardStatus);
r.get( "/:id", verifyToken, validate(idParamSchema, "params"), authorize("rateCard", "read"), getRateCardById);
r.patch( "/:id", verifyToken, validate(idParamSchema, "params"), authorize("rateCard", "update"), validate(updateRateCardSchema), updateRateCard);
r.delete( "/:id", verifyToken, validate(idParamSchema, "params"), authorize("rateCard", "delete"), deleteRateCard);

export default r;
