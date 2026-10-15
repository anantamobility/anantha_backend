import { describe, it, expect } from "vitest";
import {
  mapPrismaError,
  toHttpError,
  AppError,
  ErrorCode,
} from "../src/utils/errors.js";
import { Prisma } from "../src/generated/prisma/client.js";

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, {
    code,
    clientVersion: "test",
    meta: {},
  });
}

describe("mapPrismaError", () => {
  it("maps P2025 to a 404 NOT_FOUND", () => {
    expect(mapPrismaError(prismaError("P2025"))).toEqual({
      status: 404,
      code: ErrorCode.NOT_FOUND,
      message: expect.any(String),
    });
  });

  it("maps P2002 to a 409 CONFLICT", () => {
    expect(mapPrismaError(prismaError("P2002"))).toEqual({
      status: 409,
      code: ErrorCode.CONFLICT,
      message: expect.any(String),
    });
  });

  it("maps P2003 to a 409 CONFLICT", () => {
    expect(mapPrismaError(prismaError("P2003"))).toEqual({
      status: 409,
      code: ErrorCode.CONFLICT,
      message: expect.any(String),
    });
  });

  it("returns null for unknown/random errors", () => {
    expect(mapPrismaError(new Error("boom"))).toBeNull();
    expect(mapPrismaError({ code: "P9999" })).toBeNull();
    expect(mapPrismaError(null)).toBeNull();
    expect(mapPrismaError("nope")).toBeNull();
  });
});

describe("toHttpError", () => {
  it("maps an unknown error object to a 500 INTERNAL_ERROR", () => {
    const result = toHttpError({ some: "random object" });
    expect(result.status).toBe(500);
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(result.server).toBe(true);
  });

  it("passes an AppError through with its status, code and message intact", () => {
    const appError = new AppError(
      "Vehicle not found",
      404,
      ErrorCode.NOT_FOUND
    );

    const result = toHttpError(appError);
    expect(result.status).toBe(404);
    expect(result.code).toBe(ErrorCode.NOT_FOUND);
    expect(result.message).toBe("Vehicle not found");
    expect(result.server).toBe(false);
  });

  it("preserves a 400 AppError message", () => {
    const appError = new AppError(
      "registrationNumber: required",
      400,
      ErrorCode.VALIDATION_ERROR
    );

    const result = toHttpError(appError);
    expect(result.status).toBe(400);
    expect(result.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(result.message).toBe("registrationNumber: required");
  });
});
