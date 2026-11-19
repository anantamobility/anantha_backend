// src/middleware/errorHandler.ts
import type { Request, Response, NextFunction } from "express";
import { error as httpError } from "../utils/http.js";
import { toHttpError } from "../utils/errors.js";

export { AppError } from "../utils/errors.js";

function globalErrorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  const { status, message, server } = toHttpError(err);

  if (server) console.error("Unhandled error:", err?.message, err?.stack);
  else console.warn(`Handled error [${status}] ${message}`);

  if (res.headersSent) return next(err);
  return httpError(res, status, message);
}

export default globalErrorHandler;