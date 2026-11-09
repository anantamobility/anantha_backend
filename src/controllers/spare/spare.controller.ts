import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as spareService from "../../services/inventory.js";
import type {
  ChangeSpareStatusInput,
  CreateSpareInput,
  ListSparesQuery,
  UpdateSpareInput,
} from "../../validation/spare.js";

export const createSpare = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const spare = await spareService.createSpare(
      req.body as CreateSpareInput,
      getAuditActor(req)
    );
    return success(res, { spare }, 201);
  } catch (err) {
    next(err);
  }
};

export const getSpares = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await spareService.listSpares(
      req.query as unknown as ListSparesQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getSpareById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const spare = await spareService.getSpareById(req.params.id as string);
    return success(res, { spare });
  } catch (err) {
    next(err);
  }
};

export const updateSpare = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const spare = await spareService.updateSpare(
      req.params.id as string,
      req.body as UpdateSpareInput,
      getAuditActor(req)
    );
    return success(res, { spare });
  } catch (err) {
    next(err);
  }
};

export const changeSpareStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const spare = await spareService.changeSpareStatus(
      req.params.id as string,
      req.body as ChangeSpareStatusInput,
      getAuditActor(req)
    );
    return success(res, { spare });
  } catch (err) {
    next(err);
  }
};
