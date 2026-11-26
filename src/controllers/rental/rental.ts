import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as rentalService from "../../services/rental.js";
import * as collectionService from "../../services/collection.js";
import type {
  CloseRentalInput,
  CreateRentalInput,
  ListRentalsQuery,
} from "../../validation/rental.js";
import type {
  GenerateDuesInput,
  ListRentalDuesQuery,
} from "../../validation/collection.js";

export const createRental = async (req: Request, res: Response, next: NextFunction) => {
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
      req.query as unknown as ListRentalsQuery
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
      req.params.id as string
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRentalDues = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await collectionService.listRentalDues(
      req.params.id as string,
      req.query as unknown as ListRentalDuesQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const generateRentalDues = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await collectionService.generateDues(
      req.params.id as string,
      req.body as GenerateDuesInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
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
