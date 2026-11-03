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

    // Express 5 exposes req.query as a getter-only property, so shadow it with
    // an own writable property after successful validation.
    if (source === "query") {
      Object.defineProperty(req, "query", {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      (req as any)[source] = result.data;
    }
    next();
  };
