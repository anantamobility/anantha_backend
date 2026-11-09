import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as inventoryService from "../../services/inventory.js";
import type {
  AdjustStockInput,
  DamagedStockInput,
  ListInventoryBalancesQuery,
  ListInventoryMovementsQuery,
  ListLowStockQuery,
  OpeningStockInput,
  ServiceConsumptionInput,
  ServiceReturnInput,
  StockInInput,
} from "../../validation/inventory.js";

export const getBalances = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.listInventoryBalances(
      req.query as unknown as ListInventoryBalancesQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getMovements = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.listInventoryMovements(
      req.query as unknown as ListInventoryMovementsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getLowStock = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.listLowStock(
      req.query as unknown as ListLowStockQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getSpareMovements = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.getSpareMovements(
      req.params.spareId as string,
      req.query as unknown as ListInventoryMovementsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.getStockBalance(
      req.params.spareId as string,
      req.params.hubId as string
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const recordOpeningStock = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.recordOpeningStock(
      req.body as OpeningStockInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const recordStockIn = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.recordStockIn(
      req.body as StockInInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const recordAdjustment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.recordAdjustment(
      req.body as AdjustStockInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const consumeSpare = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.consumeSpare(
      req.body as ServiceConsumptionInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const returnSpare = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.returnServiceSpare(
      req.body as ServiceReturnInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const recordDamagedStock = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await inventoryService.recordDamagedStock(
      req.body as DamagedStockInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};
