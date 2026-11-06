import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as riderService from "../../services/rider.js";
import type {
  ChangeRiderStatusInput,
  CreateRiderInput,
  ListRiderStatusHistoryQuery,
  ListRidersQuery,
  UpdateRiderInput,
} from "../../validation/rider.js";

export const createRider = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rider = await riderService.createRider(
      req.body as CreateRiderInput,
      getAuditActor(req)
    );
    return success(res, { rider }, 201);
  } catch (err) {
    next(err);
  }
};

export const getRiders = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await riderService.listRiders(
      req.query as unknown as ListRidersQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRiderById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rider = await riderService.getRiderById(req.params.id as string);
    return success(res, { rider });
  } catch (err) {
    next(err);
  }
};

export const updateRider = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rider = await riderService.updateRider(
      req.params.id as string,
      req.body as UpdateRiderInput,
      getAuditActor(req)
    );
    return success(res, { rider });
  } catch (err) {
    next(err);
  }
};

export const changeRiderStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await riderService.changeRiderStatus(
      req.params.id as string,
      req.body as ChangeRiderStatusInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRiderStatusHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await riderService.getRiderStatusHistory(
      req.params.id as string,
      req.query as unknown as ListRiderStatusHistoryQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
