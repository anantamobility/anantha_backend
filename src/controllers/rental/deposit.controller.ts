import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as ledgerService from "../../services/ledger.js";
import type {
  AdjustDepositInput,
  DepositLedgerQuery,
  ReceiveDepositInput,
  RefundDepositInput,
} from "../../validation/deposit.js";

export const getRentalDeposit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await ledgerService.getRentalDeposit(
      req.params.id as string
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRentalDepositLedger = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await ledgerService.getRentalDepositLedger(
      req.params.id as string,
      req.query as unknown as DepositLedgerQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const receiveDeposit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await ledgerService.receiveDeposit(
      req.params.id as string,
      req.body as ReceiveDepositInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const refundDeposit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await ledgerService.refundDeposit(
      req.params.id as string,
      req.body as RefundDepositInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const adjustDeposit = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await ledgerService.adjustDeposit(
      req.params.id as string,
      req.body as AdjustDepositInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};
