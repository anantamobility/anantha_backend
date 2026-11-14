import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as payStatementService from "../../services/pay-statement.js";
import * as payoutService from "../../services/payout.js";
import type {
  ApprovePayStatementInput,
  GeneratePayStatementInput,
  ListPayStatementsQuery,
} from "../../validation/payStatement.js";
import type { PayStatementPaymentInput } from "../../validation/payout.js";

export const generatePayStatement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await payStatementService.generatePayStatement(
      req.body as GeneratePayStatementInput,
      getAuditActor(req)
    );
    return success(res, result, result.duplicate ? 200 : 201);
  } catch (err) {
    next(err);
  }
};

export const getPayStatements = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await payStatementService.listPayStatements(
      req.query as unknown as ListPayStatementsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getPayStatementById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const payStatement = await payStatementService.getPayStatementById(
      req.params.id as string
    );
    return success(res, { payStatement });
  } catch (err) {
    next(err);
  }
};

export const approvePayStatement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await payStatementService.approvePayStatement(
      req.params.id as string,
      req.body as ApprovePayStatementInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const payStatement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await payoutService.createPayout(
      {
        ...(req.body as PayStatementPaymentInput),
        payStatementId: req.params.id as string,
      },
      getAuditActor(req)
    );
    return success(res, result, result.duplicate ? 200 : 201);
  } catch (err) {
    next(err);
  }
};
