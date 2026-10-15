import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

function dbUser(permissions: { resource: string; action: string }[]) {
  return {
    id: "u1",
    name: "Tester",
    status: "ACTIVE",
    role: { name: "SUPERVISOR", permissions },
  };
}

describe("GET /vehicles authorization", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.vehicle.findMany.mockReset();
  });

  it("returns 401 UNAUTHORIZED without an Authorization header", async () => {
    const res = await request(app).get("/vehicles");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(res.body.success).toBe(false);
  });

  it("returns 403 FORBIDDEN when the database role lacks vehicle:read", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      dbUser([{ resource: "driver", action: "read" }])
    );

    const res = await request(app)
      .get("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.vehicle.findMany).not.toHaveBeenCalled();
  });

  it("returns 200 with the success envelope when the role has vehicle:read", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      dbUser([{ resource: "vehicle", action: "read" }])
    );
    prismaMock.vehicle.findMany.mockResolvedValue([
      { id: "v1", registrationNumber: "KA01AB1234" },
    ]);

    const res = await request(app)
      .get("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      vehicles: [{ id: "v1", registrationNumber: "KA01AB1234" }],
    });
    expect(prismaMock.vehicle.findMany).toHaveBeenCalledTimes(1);
  });
});
