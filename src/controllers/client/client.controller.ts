import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as clientService from "../../services/client.js";
import type {
  ChangeClientStatusInput,
  CreateClientInput,
  ListClientsQuery,
  UpdateClientInput,
} from "../../validation/client.js";

export const createClient = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const client = await clientService.createClient(
      req.body as CreateClientInput,
      getAuditActor(req)
    );
    return success(res, { client }, 201);
  } catch (err) {
    next(err);
  }
};

export const getClients = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await clientService.listClients(
      req.query as unknown as ListClientsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getClientById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const client = await clientService.getClientById(req.params.id as string);
    return success(res, { client });
  } catch (err) {
    next(err);
  }
};

export const updateClient = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const client = await clientService.updateClient(
      req.params.id as string,
      req.body as UpdateClientInput,
      getAuditActor(req)
    );
    return success(res, { client });
  } catch (err) {
    next(err);
  }
};

export const changeClientStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await clientService.changeClientStatus(
      req.params.id as string,
      req.body as ChangeClientStatusInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
