import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as payoutService from "../../services/payout.js";
import type {
  CreatePayoutInput,
  ListPayoutsQuery,
} from "../../validation/payout.js";

export const createPayout = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await payoutService.createPayout(
      req.body as CreatePayoutInput,
      getAuditActor(req)
    );
    return success(res, result, result.duplicate ? 200 : 201);
  } catch (err) {
    next(err);
  }
};

export const getPayouts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await payoutService.listPayouts(
      req.query as unknown as ListPayoutsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getPayoutById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payout = await payoutService.getPayoutById(req.params.id as string);
    return success(res, { payout });
  } catch (err) {
    next(err);
  }
};
