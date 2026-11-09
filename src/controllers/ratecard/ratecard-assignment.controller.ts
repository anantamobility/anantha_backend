import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as assignmentService from "../../services/ratecardAssignment.js";
import type {
  CreateRateCardAssignmentInput,
  ListClientRateCardsQuery,
  ListRateCardAssignmentsQuery,
  ListRateCardClientsQuery,
  UnassignRateCardAssignmentInput,
  UpdateRateCardAssignmentInput,
} from "../../validation/ratecardAssignment.js";

export const createRateCardAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const assignment = await assignmentService.createRateCardAssignment(
      req.body as CreateRateCardAssignmentInput,
      getAuditActor(req)
    );
    return success(res, { assignment }, 201);
  } catch (err) {
    next(err);
  }
};

export const getRateCardAssignments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await assignmentService.listRateCardAssignments(
      req.query as unknown as ListRateCardAssignmentsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRateCardAssignmentById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const assignment = await assignmentService.getRateCardAssignmentById(
      req.params.id as string
    );
    return success(res, { assignment });
  } catch (err) {
    next(err);
  }
};

export const updateRateCardAssignment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const assignment = await assignmentService.updateRateCardAssignment(
      req.params.id as string,
      req.body as UpdateRateCardAssignmentInput,
      getAuditActor(req)
    );
    return success(res, { assignment });
  } catch (err) {
    next(err);
  }
};

export const unassignRateCard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const assignment = await assignmentService.unassignRateCard(
      req.params.id as string,
      req.body as UnassignRateCardAssignmentInput,
      getAuditActor(req)
    );
    return success(res, { assignment });
  } catch (err) {
    next(err);
  }
};

export const getClientRateCards = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await assignmentService.listRateCardsForClient(
      req.params.id as string,
      req.query as unknown as ListClientRateCardsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRateCardClients = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await assignmentService.listClientsForRateCard(
      req.params.id as string,
      req.query as unknown as ListRateCardClientsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
