import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import { idParamSchema } from "../validation/common.js";
import {
  activateRentalSchema,
  assignVehicleSchema,
  closeRentalSchema,
  createRentalSchema,
  listRentalsQuerySchema,
} from "../validation/rental.js";
import {
  adjustDepositSchema,
  depositLedgerQuerySchema,
  receiveDepositSchema,
  refundDepositSchema,
} from "../validation/deposit.js";
import {
  generateDuesSchema,
  listRentalCollectionsQuerySchema,
  listRentalDuesQuerySchema,
} from "../validation/collection.js";
import {
  activateRental,
  assignVehicle,
  closeRental,
  createRental,
  getRentalById,
  getRentals,
} from "../controllers/rental/rental.controller.js";
import {
  adjustDeposit,
  getRentalDeposit,
  getRentalDepositLedger,
  receiveDeposit,
  refundDeposit,
} from "../controllers/rental/deposit.controller.js";
import {
  generateRentalDues,
  getRentalCollections,
  getRentalDues,
} from "../controllers/collection/collection.controller.js";

const r = Router();

r.post(
  "/",
  verifyToken,
  authorize("rental", "create"),
  validate(createRentalSchema),
  createRental
);
r.get(
  "/",
  verifyToken,
  authorize("rental", "read", { policy: false }),
  validate(listRentalsQuerySchema, "query"),
  getRentals
);

// Security deposit
r.get(
  "/:id/deposit",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("deposit", "read", { policy: false }),
  getRentalDeposit
);
r.get(
  "/:id/deposit/ledger",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("deposit", "read", { policy: false }),
  validate(depositLedgerQuerySchema, "query"),
  getRentalDepositLedger
);
r.post(
  "/:id/deposit/receive",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("deposit", "receive", { policy: false }),
  validate(receiveDepositSchema),
  receiveDeposit
);
r.post(
  "/:id/deposit/refund",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("deposit", "refund", { policy: false }),
  validate(refundDepositSchema),
  refundDeposit
);
r.post(
  "/:id/deposit/adjust",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("deposit", "adjust", { policy: false }),
  validate(adjustDepositSchema),
  adjustDeposit
);

// Collection dues and rental collections
r.get(
  "/:id/dues",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("collection", "read", { policy: false }),
  validate(listRentalDuesQuerySchema, "query"),
  getRentalDues
);
r.post(
  "/:id/dues/generate",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("collection", "due:generate", { policy: false }),
  validate(generateDuesSchema),
  generateRentalDues
);
r.get(
  "/:id/collections",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("collection", "read", { policy: false }),
  validate(listRentalCollectionsQuerySchema, "query"),
  getRentalCollections
);

// Lifecycle
r.patch(
  "/:id/assign-vehicle",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rental", "assign"),
  validate(assignVehicleSchema),
  assignVehicle
);
r.patch(
  "/:id/activate",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rental", "activate"),
  validate(activateRentalSchema),
  activateRental
);
r.patch(
  "/:id/close",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rental", "close"),
  validate(closeRentalSchema),
  closeRental
);

r.get(
  "/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("rental", "read"),
  getRentalById
);

export default r;
