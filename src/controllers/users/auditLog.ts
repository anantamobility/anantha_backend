import type { NextFunction, Request, Response } from "express";
import { success } from "../../utils/http.js";
import { listAuditLogs } from "../../services/auditLog.js";
import type { ListAuditLogsQuery } from "../../validation/auditLog.js";

export const getAuditLogs = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await listAuditLogs(
      req.query as unknown as ListAuditLogsQuery
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
};
