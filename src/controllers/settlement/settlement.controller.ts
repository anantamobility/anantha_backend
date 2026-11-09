import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as settlementService from "../../services/settlement.js";
import * as payoutService from "../../services/payout.js";
import type {
  ApproveSettlementInput,
  GenerateSettlementInput,
  ListSettlementsQuery,
} from "../../validation/settlement.js";
import type { PaySettlementInput } from "../../validation/payout.js";

export const generateSettlement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await settlementService.generateSettlement(
      req.body as GenerateSettlementInput,
      getAuditActor(req)
    );
    return success(res, result, result.duplicate ? 200 : 201);
  } catch (err) {
    next(err);
  }
};

export const getSettlements = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await settlementService.listSettlements(
      req.query as unknown as ListSettlementsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getSettlementById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const settlement = await settlementService.getSettlementById(
      req.params.id as string
    );
    return success(res, { settlement });
  } catch (err) {
    next(err);
  }
};

export const approveSettlement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await settlementService.approveSettlement(
      req.params.id as string,
      req.body as ApproveSettlementInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const paySettlement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await payoutService.createPayout(
      {
        ...(req.body as PaySettlementInput),
        settlementId: req.params.id as string,
      },
      getAuditActor(req)
    );
    return success(res, result, result.duplicate ? 200 : 201);
  } catch (err) {
    next(err);
  }
};
