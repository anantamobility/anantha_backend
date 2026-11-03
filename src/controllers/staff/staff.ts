import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as staffService from "../../services/staff.js";
import type {
  CreateStaffInput,
  ListStaffQuery,
  UpdateStaffInput,
} from "../../validation/staff.js";

export const createStaff = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const staff = await staffService.createStaff(
      req.body as CreateStaffInput,
      getAuditActor(req)
    );
    return success(res, { staff }, 201);
  } catch (err) {
    next(err);
  }
};

export const getStaff = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await staffService.listStaff(
      req.query as unknown as ListStaffQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getStaffById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const staff = await staffService.getStaffById(req.params.id as string);
    return success(res, { staff });
  } catch (err) {
    next(err);
  }
};

export const updateStaff = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const staff = await staffService.updateStaff(
      req.params.id as string,
      req.body as UpdateStaffInput,
      getAuditActor(req)
    );
    return success(res, { staff });
  } catch (err) {
    next(err);
  }
};

export const deleteStaff = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await staffService.deleteStaff(req.params.id as string, getAuditActor(req));
    return success(res, { message: "Staff deleted successfully" });
  } catch (err) {
    next(err);
  }
};
