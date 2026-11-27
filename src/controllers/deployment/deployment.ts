import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as deploymentService from "../../services/deployment.js";
import type {
  DeployInInput,
  DeployOutInput,
  ListDeploymentsQuery,
} from "../../validation/deployment.js";

export const deploymentOut = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const deployment = await deploymentService.deploymentOut(
      req.body as DeployOutInput,
      getAuditActor(req)
    );
    return success(res, { deployment }, 201);
  } catch (err) {
    next(err);
  }
};

export const deploymentIn = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const deployment = await deploymentService.deploymentIn(
      req.params.id as string,
      req.body as DeployInInput,
      getAuditActor(req)
    );
    return success(res, { deployment });
  } catch (err) {
    next(err);
  }
};

export const getDeployments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await deploymentService.listDeployments(
      req.query as unknown as ListDeploymentsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getDeploymentById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const deployment = await deploymentService.getDeploymentById(
      req.params.id as string
    );
    return success(res, { deployment });
  } catch (err) {
    next(err);
  }
};
