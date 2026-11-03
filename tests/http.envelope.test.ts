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
    role: { name: "ADMIN", permissions },
  };
}

describe("HTTP response envelope", () => {
  beforeEach(() => {
    prismaMock.user.findUnique.mockReset();
    prismaMock.vehicle.findMany.mockReset();
    prismaMock.vehicle.count.mockReset();
    prismaMock.vehicle.create.mockReset();
    prismaMock.auditLog.create.mockReset();
  });

  it("GET /vehicles returns 200 with { success: true, data }", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      dbUser([{ resource: "vehicle", action: "read" }])
    );
    prismaMock.vehicle.findMany.mockResolvedValue([]);
    prismaMock.vehicle.count.mockResolvedValue(0);

    const res = await request(app)
      .get("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true });
    expect(res.body).toHaveProperty("data");
    expect(res.body.data).toEqual({
      vehicles: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  it("POST /vehicles with {} returns 400 with the VALIDATION_ERROR envelope", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      dbUser([{ resource: "vehicle", action: "create" }])
    );

    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
  });
});
