import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { verifyToken } from "../src/middleware/verifyToken.js";
import { authorize } from "../src/middleware/pbac.js";
import globalErrorHandler from "../src/middleware/errorHandler.js";
import type { AppResource, AppAction } from "../src/registry/perm.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

// Throwaway app exercising the real authorize middleware with a fake resource
// that is intentionally not part of the permission registry.
const fakeResource = "widget" as unknown as AppResource;
const fakeAction = "read" as unknown as AppAction;

const reached = (_req: express.Request, res: express.Response) =>
  res.json({ success: true, data: { reached: true } });

const app = express();
app.use(express.json());

// authorize's own missing-user guard, with no upstream authentication.
app.get(
  "/no-user",
  authorize(fakeResource, fakeAction, { policy: false }),
  reached
);

// Full chain: real token verification followed by the real authorize check.
app.get(
  "/probe",
  verifyToken,
  authorize(fakeResource, fakeAction, { policy: false }),
  reached
);

app.use(globalErrorHandler);

function userWithPermissions(
  permissions: { resource: string; action: string }[]
) {
  return {
    id: "u1",
    name: "Tester",
    status: "ACTIVE",
    role: { name: "SUPERVISOR", permissions },
  };
}

describe("authorize (unknown resource)", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
  });

  it("returns 401 with the standard error envelope when no user/token is supplied", async () => {
    const res = await request(app).get("/no-user");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: expect.any(String) },
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 401 with the standard error envelope when the token header is missing", async () => {
    const res = await request(app).get("/probe");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      error: { code: "UNAUTHORIZED", message: expect.any(String) },
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns 403 with the standard error envelope when the token lacks the permission", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      userWithPermissions([{ resource: "vehicle", action: "read" }])
    );

    const res = await request(app)
      .get("/probe")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(res.body.error.message).toContain("widget:read");
  });
});
