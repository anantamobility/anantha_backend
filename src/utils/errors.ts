// src/utils/errors.ts
export const ErrorCode = {
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCodeName = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode: number, code: string = ErrorCode.INTERNAL_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

type MappedError = { status: number; code: string; message: string };

export function mapPrismaError(err: any): MappedError | null {
  if (!err || typeof err.code !== "string") return null;
  switch (err.code) {
    case "P2025": // required record not found
      return { status: 404, code: ErrorCode.NOT_FOUND, message: "Resource not found" };
    case "P2002": // unique constraint violation
      return { status: 409, code: ErrorCode.CONFLICT, message: "Resource already exists" };
    case "P2003": // foreign key constraint
      return { status: 409, code: ErrorCode.CONFLICT, message: "Related resource constraint violated" };
    case "P2006":
    case "P2009":
    case "P2023": // malformed input
      return { status: 400, code: ErrorCode.VALIDATION_ERROR, message: "Invalid request data" };
    default:
      return null; // unknown DB failure -> caller emits safe 500
  }
}

/**
 * Converts the common write-time Prisma constraint failures into AppErrors with
 * resource-specific messages, then rethrows anything else unchanged.
 */
export function rethrowPrismaError(err: unknown, duplicateMessage: string): never {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (code === "P2002") {
      throw new AppError(duplicateMessage, 409, ErrorCode.CONFLICT);
    }
    if (code === "P2003") {
      throw new AppError(
        "Related resource constraint violated",
        409,
        ErrorCode.CONFLICT
      );
    }
  }
  throw err;
}

export function toHttpError(err: any): { status: number; code: string; message: string; server: boolean } {
  if (err instanceof AppError) {
    return { status: err.statusCode, code: err.code, message: err.message, server: err.statusCode >= 500 };
  }
  const mapped = mapPrismaError(err);
  if (mapped) return { ...mapped, server: false };
  return { status: 500, code: ErrorCode.INTERNAL_ERROR, message: "Internal Server Error", server: true };
}