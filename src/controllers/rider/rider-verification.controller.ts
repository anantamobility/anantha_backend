import type { NextFunction, Request, Response } from "express";
import type { VerificationType } from "../../generated/prisma/client.js";
import { success } from "../../utils/http.js";
import { getAuditActor } from "../../utils/log.js";
import * as verificationService from "../../services/rider-verification.js";
import type {
  ApproveVerificationInput,
  RejectVerificationInput,
  SubmitVerificationInput,
} from "../../validation/rider.js";

export const listRiderVerifications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await verificationService.listRiderVerifications(
      req.params.id as string
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const getRiderVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const verification = await verificationService.getRiderVerification(
      req.params.id as string,
      req.params.type as VerificationType
    );
    return success(res, { verification });
  } catch (err) {
    next(err);
  }
};

export const submitRiderVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await verificationService.submitRiderVerification(
      req.params.id as string,
      req.params.type as VerificationType,
      req.body as SubmitVerificationInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const approveRiderVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await verificationService.approveRiderVerification(
      req.params.id as string,
      req.params.type as VerificationType,
      req.body as ApproveVerificationInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

export const rejectRiderVerification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await verificationService.rejectRiderVerification(
      req.params.id as string,
      req.params.type as VerificationType,
      req.body as RejectVerificationInput,
      getAuditActor(req)
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
