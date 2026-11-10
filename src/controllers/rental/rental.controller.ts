import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as rentalService from "../../services/rental.js";
import type {
  ActivateRentalInput,
  AssignVehicleInput,
  CloseRentalInput,
  CreateRentalInput,
  ListRentalsQuery,
} from "../../validation/rental.js";

export const createRental = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rental = await rentalService.createRental(
      req.body as CreateRentalInput,
      getAuditActor(req)
    );
    return success(res, { rental }, 201);
  } catch (err) {
    next(err);
  }
};

export const getRentals = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await rentalService.listRentals(
      req.query as unknown as ListRentalsQuery,
      req.user
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRentalById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await rentalService.getRentalById(
      req.params.id as string,
      req.user
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const assignVehicle = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await rentalService.assignVehicle(
      req.params.id as string,
      req.body as AssignVehicleInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const activateRental = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await rentalService.activateRental(
      req.params.id as string,
      req.body as ActivateRentalInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const closeRental = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await rentalService.closeRental(
      req.params.id as string,
      req.body as CloseRentalInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
