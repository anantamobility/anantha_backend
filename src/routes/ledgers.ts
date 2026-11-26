import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import applyIdempotency from "../middleware/idempotency.js";
import { idParamSchema } from "../validation/common.js";
import { depositLedgerQuerySchema, receiveDepositSchema, refundDepositSchema } from "../validation/deposit.js";
import { deliveryPaySchema, ledgerSummaryQuerySchema, listLedgerQuerySchema } from "../validation/ledger.js";
import { getLedgerEntries, getRiderLedgerSummary, recordDeliveryPay } from "../controllers/ledger/mainLedger.js";
import { getDepositLedger, getRentalDeposit, receiveDeposit, refundDeposit } from "../controllers/ledger/deposit.js";

const r = Router();

// Commented for route review + frontend integration.
// Uncomment one route at a time after review.

// Main ledger
// r.get("/ledger-entries/summary", verifyToken, authorize("ledgerEntry", "read", { policy: false }), validate(ledgerSummaryQuerySchema, "query"), getRiderLedgerSummary);
// r.get("/ledger-entries", verifyToken, authorize("ledgerEntry", "read", { policy: false }), validate(listLedgerQuerySchema, "query"), getLedgerEntries);

// Security deposit ledger
// r.get("/rentals/:id/deposit", verifyToken, validate(idParamSchema, "params"), authorize("deposit", "read", { policy: false }), getRentalDeposit);
// r.get("/deposits/:id/ledger", verifyToken, validate(idParamSchema, "params"), authorize("deposit", "read", { policy: false }), validate(depositLedgerQuerySchema, "query"), getDepositLedger);

// Money writes
// r.post("/ledger-entries/delivery-pay", verifyToken, authorize("ledgerEntry", "create", { policy: false }), validate(deliveryPaySchema), applyIdempotency(), recordDeliveryPay);
// r.post("/rentals/:id/deposit/receive", verifyToken, validate(idParamSchema, "params"), authorize("deposit", "receive", { policy: false }), validate(receiveDepositSchema), applyIdempotency(), receiveDeposit);
// r.post("/rentals/:id/deposit/refund", verifyToken, validate(idParamSchema, "params"), authorize("deposit", "refund", { policy: false }), validate(refundDepositSchema), applyIdempotency(), refundDeposit);

export default r;
