import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as rateCardService from "../../services/ratecard.js";
import type {
  ChangeRateCardStatusInput,
  CreateRateCardInput,
  ListRateCardsQuery,
  UpdateRateCardInput,
} from "../../validation/ratecard.js";

export const createRateCard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rateCard = await rateCardService.createRateCard(
      req.body as CreateRateCardInput,
      getAuditActor(req)
    );
    return success(res, { rateCard }, 201);
  } catch (err) {
    next(err);
  }
};

export const getRateCards = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await rateCardService.listRateCards(
      req.query as unknown as ListRateCardsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRateCardById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rateCard = await rateCardService.getRateCardById(
      req.params.id as string
    );
    return success(res, { rateCard });
  } catch (err) {
    next(err);
  }
};

export const updateRateCard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const rateCard = await rateCardService.updateRateCard(
      req.params.id as string,
      req.body as UpdateRateCardInput,
      getAuditActor(req)
    );
    return success(res, { rateCard });
  } catch (err) {
    next(err);
  }
};

export const changeRateCardStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await rateCardService.changeRateCardStatus(
      req.params.id as string,
      req.body as ChangeRateCardStatusInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const deleteRateCard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await rateCardService.deleteRateCard(
      req.params.id as string,
      getAuditActor(req)
    );
    return success(res, { message: "Ratecard deleted successfully" });
  } catch (err) {
    next(err);
  }
};
