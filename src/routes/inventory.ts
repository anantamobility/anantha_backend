import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import {
  adjustStockSchema,
  damagedStockSchema,
  listInventoryBalancesQuerySchema,
  listInventoryMovementsQuerySchema,
  listLowStockQuerySchema,
  openingStockSchema,
  serviceConsumptionSchema,
  serviceReturnSchema,
  spareHubParamsSchema,
  spareIdParamsSchema,
  stockInSchema,
} from "../validation/inventory.js";
import {
  consumeSpare,
  getBalance,
  getBalances,
  getLowStock,
  getMovements,
  getSpareMovements,
  recordAdjustment,
  recordDamagedStock,
  recordOpeningStock,
  recordStockIn,
  returnSpare,
} from "../controllers/inventory/inventory.controller.js";

const r = Router();

r.get(
  "/balances",
  verifyToken,
  authorize("inventory", "read", { policy: false }),
  validate(listInventoryBalancesQuerySchema, "query"),
  getBalances
);
r.get(
  "/balances/:spareId/:hubId",
  verifyToken,
  validate(spareHubParamsSchema, "params"),
  authorize("inventory", "read", { policy: false }),
  getBalance
);
r.get(
  "/movements",
  verifyToken,
  authorize("inventory", "read", { policy: false }),
  validate(listInventoryMovementsQuerySchema, "query"),
  getMovements
);
r.get(
  "/low-stock",
  verifyToken,
  authorize("inventory", "read", { policy: false }),
  validate(listLowStockQuerySchema, "query"),
  getLowStock
);
r.get(
  "/spares/:spareId/movements",
  verifyToken,
  validate(spareIdParamsSchema, "params"),
  authorize("inventory", "read", { policy: false }),
  validate(listInventoryMovementsQuerySchema, "query"),
  getSpareMovements
);

r.post(
  "/opening-stock",
  verifyToken,
  authorize("inventory", "opening-stock", { policy: false }),
  validate(openingStockSchema),
  recordOpeningStock
);
r.post(
  "/stock-in",
  verifyToken,
  authorize("inventory", "stock-in", { policy: false }),
  validate(stockInSchema),
  recordStockIn
);
r.post(
  "/adjust",
  verifyToken,
  authorize("inventory", "adjust", { policy: false }),
  validate(adjustStockSchema),
  recordAdjustment
);
r.post(
  "/consume",
  verifyToken,
  authorize("inventory", "consume", { policy: false }),
  validate(serviceConsumptionSchema),
  consumeSpare
);
r.post(
  "/return",
  verifyToken,
  authorize("inventory", "return", { policy: false }),
  validate(serviceReturnSchema),
  returnSpare
);
r.post(
  "/damage",
  verifyToken,
  authorize("inventory", "damage", { policy: false }),
  validate(damagedStockSchema),
  recordDamagedStock
);

export default r;
