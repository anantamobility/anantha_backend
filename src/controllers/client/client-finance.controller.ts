import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as clientFinanceService from "../../services/client-finance.js";
import type {
  GenerateClientDuesInput,
  ListClientCollectionsQuery,
  ListClientDuesQuery,
  RecordClientPaymentInput,
} from "../../validation/clientFinance.js";

export const getClientFinancials = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await clientFinanceService.getClientFinancialSummary(
      req.params.id as string
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const generateClientDues = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await clientFinanceService.generateClientDues(
      req.params.id as string,
      req.body as GenerateClientDuesInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const recordClientPayment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await clientFinanceService.recordClientPayment(
      req.params.id as string,
      req.body as RecordClientPaymentInput,
      getAuditActor(req)
    );
    return success(res, result, result.duplicate ? 200 : 201);
  } catch (err) {
    next(err);
  }
};

export const getClientDues = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await clientFinanceService.listClientDues(
      req.params.id as string,
      req.query as unknown as ListClientDuesQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getClientCollections = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await clientFinanceService.listClientCollections(
      req.params.id as string,
      req.query as unknown as ListClientCollectionsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
