import { Router } from "express";
import { verifyToken } from "../middleware/verifyToken.js";
import { authorize } from "../middleware/pbac.js";
import { validate } from "../middleware/validate.js";
import {
  ledgerSummaryQuerySchema,
  listLedgerQuerySchema,
} from "../validation/ledger.js";
import {
  getLedgerEntries,
  getRiderLedgerSummary,
} from "../controllers/ledger/mainLedger.js";

const r = Router();

r.get( "/summary", verifyToken, authorize("ledgerEntry", "read", { policy: false }), 
      validate(ledgerSummaryQuerySchema, "query"), getRiderLedgerSummary);

r.get(
  "/",
  verifyToken,
  authorize("ledgerEntry", "read", { policy: false }),
  validate(listLedgerQuerySchema, "query"),
  getLedgerEntries
);

export default r;
