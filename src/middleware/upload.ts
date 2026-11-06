import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import envConfig from "../config/env.js";
import { isAllowedDocumentMime } from "../storage/mime.js";
import { AppError, ErrorCode } from "../utils/errors.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: envConfig.storageMaxFileBytes, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!isAllowedDocumentMime(file.mimetype)) {
      return callback(
        new AppError(
          `Unsupported document MIME type: ${file.mimetype}`,
          400,
          ErrorCode.VALIDATION_ERROR
        )
      );
    }
    callback(null, true);
  },
}).single("file");

export function uploadRiderDocument(
  req: Request,
  res: Response,
  next: NextFunction
) {
  upload(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `File exceeds the ${envConfig.storageMaxFileBytes} byte limit`
          : err.message;
      return next(new AppError(message, 400, ErrorCode.VALIDATION_ERROR));
    }

    return next(err);
  });
}
