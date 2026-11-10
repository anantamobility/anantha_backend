import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as hubService from "../../services/hub.js";
import type {
  CreateHubInput,
  ListHubsQuery,
  UpdateHubInput,
} from "../../validation/hub.js";

export const createHub = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const hub = await hubService.createHub(
      req.body as CreateHubInput,
      getAuditActor(req)
    );
    return success(res, { hub }, 201);
  } catch (err) {
    next(err);
  }
};

export const getHubs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await hubService.listHubs(
      req.query as unknown as ListHubsQuery,
      req.user
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getHubById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const hub = await hubService.getHubById(
      req.params.id as string,
      req.user
    );
    return success(res, { hub });
  } catch (err) {
    next(err);
  }
};

export const updateHub = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const hub = await hubService.updateHub(
      req.params.id as string,
      req.body as UpdateHubInput,
      getAuditActor(req)
    );
    return success(res, { hub });
  } catch (err) {
    next(err);
  }
};

export const deleteHub = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await hubService.deleteHub(req.params.id as string, getAuditActor(req));
    return success(res, { message: "Hub deleted successfully" });
  } catch (err) {
    next(err);
  }
};
