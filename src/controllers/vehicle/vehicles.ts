import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as vehicleService from "../../services/vehicle.js";
import type {
  ChangeVehicleStatusInput,
  CreateVehicleInput,
  ListVehicleStatusHistoryQuery,
  ListVehiclesQuery,
  UpdateVehicleInput,
} from "../../validation/vehicle.js";

export const createVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const vehicle = await vehicleService.createVehicle(
      req.body as CreateVehicleInput,
      getAuditActor(req)
    );
    return success(res, { vehicle }, 201);
  } catch (err) {
    next(err);
  }
};

export const getVehicles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await vehicleService.listVehicles(
      req.query as unknown as ListVehiclesQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getVehicleById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const vehicle = await vehicleService.getVehicleById(
      req.params.id as string
    );
    return success(res, { vehicle });
  } catch (err) {
    next(err);
  }
};

export const updateVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const vehicle = await vehicleService.updateVehicle(
      req.params.id as string,
      req.body as UpdateVehicleInput,
      getAuditActor(req)
    );
    return success(res, { vehicle });
  } catch (err) {
    next(err);
  }
};

export const deleteVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await vehicleService.deleteVehicle(
      req.params.id as string,
      getAuditActor(req)
    );
    return success(res, { message: "Vehicle deleted successfully" });
  } catch (err) {
    next(err);
  }
};

export const changeVehicleStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await vehicleService.changeVehicleStatus(
      req.params.id as string,
      req.body as ChangeVehicleStatusInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getVehicleStatusHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await vehicleService.getVehicleStatusHistory(
      req.params.id as string,
      req.query as unknown as ListVehicleStatusHistoryQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
