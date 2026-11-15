import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as documentService from "../../services/rider-document.js";
import type {
  ListRiderDocumentsQuery,
  RiderDocumentMetadata,
} from "../../validation/rider.js";

export const listRiderDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await documentService.listRiderDocuments(
      req.params.id as string,
      req.query as unknown as ListRiderDocumentsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRiderDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const document = await documentService.getRiderDocument(
      req.params.id as string,
      req.params.documentId as string
    );
    return success(res, { document });
  } catch (err) {
    next(err);
  }
};

export const uploadRiderDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const document = await documentService.uploadRiderDocument(
      req.params.id as string,
      req.file,
      req.body as RiderDocumentMetadata,
      getAuditActor(req)
    );
    return success(res, { document }, 201);
  } catch (err) {
    next(err);
  }
};

export const downloadRiderDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { url } = await documentService.downloadRiderDocument(
      req.params.id as string,
      req.params.documentId as string
    );

    return res.redirect(url);
  } catch (err) {
    next(err);
  }
};

export const deleteRiderDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await documentService.deleteRiderDocument(
      req.params.id as string,
      req.params.documentId as string,
      getAuditActor(req)
    );
    return success(res, { message: "Document deleted successfully" });
  } catch (err) {
    next(err);
  }
};
