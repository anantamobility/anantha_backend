import { extname } from "node:path";
import { AppError, ErrorCode } from "../utils/errors.js";

export const ALLOWED_DOCUMENT_MIME_TYPES: Record<string, readonly string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export function isAllowedDocumentMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    ALLOWED_DOCUMENT_MIME_TYPES,
    mime
  );
}

/**
 * Validates the client-provided filename extension against the declared MIME
 * type and returns a canonical extension. The original filename is never used
 * to build the storage key.
 */
export function safeDocumentExtension(
  originalName: string,
  mime: string
): string {
  const allowed = ALLOWED_DOCUMENT_MIME_TYPES[mime];
  if (!allowed) {
    throw new AppError(
      `Unsupported document MIME type: ${mime}`,
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const extension = extname(originalName).toLowerCase();
  if (extension) {
    if (!allowed.includes(extension)) {
      throw new AppError(
        "Document file extension does not match its MIME type",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
    return extension;
  }

  return allowed[0];
}
