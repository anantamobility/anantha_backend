import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as ledgerService from "../../services/ledger.js";
import type {
  DeliveryPayInput,
  LedgerSummaryQuery,
  ListLedgerQuery,
} from "../../validation/ledger.js";

export const recordDeliveryPay = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await ledgerService.recordDeliveryPay(
      req.body as DeliveryPayInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const getLedgerEntries = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await ledgerService.listLedgerEntries(
      req.query as unknown as ListLedgerQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRiderLedgerSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await ledgerService.getRiderLedgerSummary(
      req.query as unknown as LedgerSummaryQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
