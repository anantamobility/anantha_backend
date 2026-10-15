// src/middleware/validate.ts
import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { AppError, ErrorCode } from "../utils/errors.js";

type Source = "body" | "params" | "query";

export const validate = (schema: ZodType, source: Source = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".") || source}: ${i.message}`)
        .join("; ");
      return next(new AppError(message, 400, ErrorCode.VALIDATION_ERROR));
    }
    (req as any)[source] = result.data;
    next();
  };
