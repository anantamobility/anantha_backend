import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as collectionService from "../../services/collection.js";
import type {
  ClearCollectionInput,
  CreateCollectionInput,
  GenerateDuesInput,
  ListCollectionsQuery,
  ListRentalCollectionsQuery,
  ListRentalDuesQuery,
} from "../../validation/collection.js";

export const createCollection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await collectionService.createCollection(
      req.body as CreateCollectionInput,
      getAuditActor(req)
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
};

export const getCollections = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await collectionService.listCollections(
      req.query as unknown as ListCollectionsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getCollectionById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const collection = await collectionService.getCollectionById(
      req.params.id as string
    );
    return success(res, { collection });
  } catch (err) {
    next(err);
  }
};

export const clearCollection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await collectionService.clearCollection(
      req.params.id as string,
      req.body as ClearCollectionInput,
      getAuditActor(req)
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

export const getRentalCollections = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await collectionService.listRentalCollections(
      req.params.id as string,
      req.query as unknown as ListRentalCollectionsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
