import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as serviceService from "../../services/service.js";
import type {
  ApproveResponsibilityInput,
  AwaitPartsInput,
  AssignReplacementInput,
  CancelServiceInput,
  CloseServiceInput,
  CompleteServiceInput,
  CreateServiceChargeInput,
  CreateServiceInput,
  ListServicesQuery,
  ResumeServiceInput,
  ReturnReplacementInput,
  StartServiceInput,
  UpdateServiceInput,
} from "../../validation/service.js";

export const createService = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const service = await serviceService.createService(
      req.body as CreateServiceInput,
      getAuditActor(req)
    );
    return success(res, { service }, 201);
  } catch (err) {
    next(err);
  }
};

export const getServices = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.listServices(
      req.query as unknown as ListServicesQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getServiceById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.getServiceById(req.params.id as string);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const updateService = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.updateService(
      req.params.id as string,
      req.body as UpdateServiceInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const startService = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.startService(
      req.params.id as string,
      req.body as StartServiceInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const markAwaitingParts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.markServiceAwaitingParts(
      req.params.id as string,
      req.body as AwaitPartsInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const resumeServiceWork = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.resumeServiceWork(
      req.params.id as string,
      req.body as ResumeServiceInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const completeService = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.completeService(
      req.params.id as string,
      req.body as CompleteServiceInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const closeService = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.closeService(
      req.params.id as string,
      req.body as CloseServiceInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const cancelService = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.cancelService(
      req.params.id as string,
      req.body as CancelServiceInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const approveResponsibility = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.approveServiceResponsibility(
      req.params.id as string,
      req.body as ApproveResponsibilityInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const assignReplacement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.assignReplacement(
      req.params.id as string,
      req.body as AssignReplacementInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const returnReplacement = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.returnReplacement(
      req.params.id as string,
      req.body as ReturnReplacementInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const createServiceCharge = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await serviceService.createServiceCharge(
      req.params.id as string,
      req.body as CreateServiceChargeInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};
