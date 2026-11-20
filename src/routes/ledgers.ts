import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import applyIdempotency from "../middleware/idempotency.js";
import { idParamSchema } from "../validation/common.js";
import {
  depositLedgerQuerySchema,
  receiveDepositSchema,
  refundDepositSchema,
} from "../validation/deposit.js";
import {
  ledgerSummaryQuerySchema,
  listLedgerQuerySchema,
} from "../validation/ledger.js";
import {
  getLedgerEntries,
  getRiderLedgerSummary,
} from "../controllers/ledger/mainLedger.js";
import {
  getDepositLedger,
  getRentalDeposit,
  receiveDeposit,
  refundDeposit,
} from "../controllers/ledger/deposit.js";

const r = Router();

// Main ledger
r.get(
  "/ledger-entries/summary",
  verifyToken,
  authorize("ledgerEntry", "read", { policy: false }),
  validate(ledgerSummaryQuerySchema, "query"),
  getRiderLedgerSummary
);
r.get(
  "/ledger-entries",
  verifyToken,
  authorize("ledgerEntry", "read", { policy: false }),
  validate(listLedgerQuerySchema, "query"),
  getLedgerEntries
);

// Security deposit ledger
//gets deposit data + totals for a rental 
r.get(
  "/rentals/:id/deposit",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("deposit", "read", { policy: false }),
  getRentalDeposit
);

//gets deposit ledger entries for a deposit
r.get(
  "/deposit-ledger/:id",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("deposit", "read", { policy: false }),
  validate(depositLedgerQuerySchema, "query"),
  getDepositLedger
);

//add inital amount to deposit
r.post(
  "/rentals/:id/deposit/receive",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("deposit", "receive", { policy: false }),
  validate(receiveDepositSchema),
  applyIdempotency(),
  receiveDeposit
);

//refund watever amount in deposit to rider/client?
r.post(
  "/rentals/:id/deposit/refund",
  verifyToken,
  validate(idParamSchema, "params"),
  authorize("deposit", "refund", { policy: false }),
  validate(refundDepositSchema),
  applyIdempotency(),
  refundDeposit
);

export default r;
