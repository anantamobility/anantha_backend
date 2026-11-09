import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as earningsService from "../../services/earnings.js";
import type {
  AdjustEarningInput,
  EarningsSummaryQuery,
  ListEarningsQuery,
  RecordEarningInput,
} from "../../validation/earnings.js";

export const recordEarning = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await earningsService.recordEarning(
      req.body as RecordEarningInput,
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
      req.body as AdjustEarningInput,
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
      req.query as unknown as ListEarningsQuery
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
      req.query as unknown as EarningsSummaryQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
