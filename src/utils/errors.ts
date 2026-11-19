// src/utils/errors.ts
export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Maps a known Prisma failure onto an AppError, optionally overriding the
   * duplicate message with a resource-specific one. Returns null for errors
   * that are not recognised, so the caller can rethrow them untouched.
   */
  static fromPrisma(err: unknown, duplicateMessage?: string): AppError | null {
    const mapped = mapPrismaError(err);
    if (!mapped) return null;

    const prismaCode = (err as { code?: string }).code;
    const message = prismaCode === "P2002" && duplicateMessage ? duplicateMessage : mapped.message;
    return new AppError(message, mapped.status);
  }
}

type MappedError = { status: number; message: string };

export function mapPrismaError(err: any): MappedError | null {
  if (!err || typeof err.code !== "string") return null;

  const target = Array.isArray(err?.meta?.target)
    ? (err.meta.target as string[]).join(", ")
    : typeof err?.meta?.target === "string"
      ? err.meta.target
      : null;

  switch (err.code) {
    case "P2025": // required record not found
      return { status: 404, message: "Record not found" };
    case "P2002": // unique constraint violation
      return {
        status: 409,
        message: target
          ? `A record with this ${target} already exists. Use a different value.`
          : "A record with these values already exists. Use a different value.",
      };
    case "P2003": // foreign key constraint
      return {
        status: 409,
        message: "This record is still referenced by other records. Remove or reassign them first.",
      };
    case "P2014": // relation violation on required relation
      return {
        status: 409,
        message: "This change would break a required relation. Check the linked records first.",
      };
    case "P2000": // value too long for column
      return { status: 400, message: "A value is too long for its field." };
    case "P2006":
    case "P2009":
    case "P2023": // malformed input
      return { status: 400, message: "Invalid request data" };
    default:
      return null; // unknown DB failure -> caller emits safe 500
  }
}

export function toHttpError(err: any): { status: number; message: string; server: boolean } {
  if (err instanceof AppError) {
    return { status: err.statusCode, message: err.message, server: err.statusCode >= 500 };
  }
  const mapped = mapPrismaError(err);
  if (mapped) return { ...mapped, server: false };
  return { status: 500, message: "Internal Server Error", server: true };
}
