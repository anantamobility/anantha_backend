import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { isAllowedDocumentMime } from "../storage/mime.js";
import { AppError, ErrorCode } from "../utils/errors.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
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
          ? `File exceeds the ${MAX_UPLOAD_BYTES} byte limit`
          : err.message;
      return next(new AppError(message, 400, ErrorCode.VALIDATION_ERROR));
    }

    return next(err);
  });
}
