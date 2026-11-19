import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as earningsService from "../../services/ledger.js";
import type {
  AdjustLedgerInput,
  LedgerSummaryQuery,
  ListLedgerQuery,
  RecordLedgerInput,
} from "../../validation/earnings.js";

export const recordEarning = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await earningsService.recordEarning(
      req.body as RecordLedgerInput,
      getAuditActor(req)
    );
    return success(res, result, result.duplicate ? 200 : 201);
  } catch (err) {
    next(err);
  }
};

export const adjustEarning = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await earningsService.adjustEarning(
      req.body as AdjustLedgerInput,
      getAuditActor(req)
    );
    return success(res, result, result.duplicate ? 200 : 201);
  } catch (err) {
    next(err);
  }
};

export const getEarnings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await earningsService.listEarnings(
      req.query as unknown as ListLedgerQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getEarningsSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await earningsService.getEarningsSummary(
      req.query as unknown as LedgerSummaryQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
