import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const HUB_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c";

const emptyCounts = {
  vehicles: 0,
  staff: 0,
  riders: 0,
  rentals: 0,
  assignments: 0,
  inventoryBalances: 0,
  movementsFrom: 0,
  movementsTo: 0,
};

function authUser(permissions: { resource: string; action: string }[]) {
  return {
    id: "u1",
    name: "Tester",
    status: "ACTIVE",
    role: { name: "ADMIN", permissions },
  };
}

function authenticate(permissions: { resource: string; action: string }[]) {
  prismaMock.user.findUnique.mockResolvedValue(authUser(permissions));
}

function existingHub(overrides: Record<string, unknown> = {}) {
  return {
    id: HUB_ID,
    name: "Main Hub",
    code: "MAIN",
    address: null,
    contactPhone: null,
    contactEmail: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.hub.findUnique.mockReset();
  prismaMock.hub.findFirst.mockReset();
  prismaMock.hub.findMany.mockReset();
  prismaMock.hub.count.mockReset();
  prismaMock.hub.create.mockReset();
  prismaMock.hub.update.mockReset();
  prismaMock.hub.delete.mockReset();
  prismaMock.auditLog.create.mockReset();
});

describe("POST /hubs", () => {
  it("creates a hub, applies defaults, and writes an audit record", async () => {
    authenticate([{ resource: "hub", action: "create" }]);
    prismaMock.hub.create.mockResolvedValue(existingHub());

    const res = await request(app)
      .post("/hubs")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Main Hub", code: "MAIN" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { hub: { id: HUB_ID, name: "Main Hub", code: "MAIN" } },
    });
    expect(prismaMock.hub.create).toHaveBeenCalledWith({
      data: { name: "Main Hub", code: "MAIN", isActive: true },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        resource: "Hub",
        resourceId: HUB_ID,
      }),
    });
  });

  it("returns 400 for an invalid payload without touching the database", async () => {
    authenticate([{ resource: "hub", action: "create" }]);

    const res = await request(app)
      .post("/hubs")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ code: "MAIN" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.hub.create).not.toHaveBeenCalled();
  });

  it("returns 409 when the hub name or code already exists", async () => {
    authenticate([{ resource: "hub", action: "create" }]);
    prismaMock.hub.create.mockRejectedValue({ code: "P2002" });

    const res = await request(app)
      .post("/hubs")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Main Hub", code: "MAIN" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app).post("/hubs").send({ name: "X", code: "X" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
    expect(prismaMock.hub.create).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks hub:create", async () => {
    authenticate([{ resource: "hub", action: "read" }]);

    const res = await request(app)
      .post("/hubs")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Main Hub", code: "MAIN" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.hub.create).not.toHaveBeenCalled();
  });
});

describe("GET /hubs", () => {
  it("lists hubs with a pagination envelope", async () => {
    authenticate([{ resource: "hub", action: "read" }]);
    prismaMock.hub.findMany.mockResolvedValue([existingHub()]);
    prismaMock.hub.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/hubs")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.hubs).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(prismaMock.hub.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 })
    );
  });

  it("applies pagination, search, and isActive filters", async () => {
    authenticate([{ resource: "hub", action: "read" }]);
    prismaMock.hub.findMany.mockResolvedValue([]);
    prismaMock.hub.count.mockResolvedValue(11);

    const res = await request(app)
      .get("/hubs?page=2&limit=5&search=main&isActive=false")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toMatchObject({
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3,
    });

    const args = prismaMock.hub.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 5, take: 5 });
    expect(args.where).toMatchObject({ isActive: false });
    expect(args.where.OR).toEqual(
      expect.arrayContaining([
        { name: { contains: "main", mode: "insensitive" } },
        { code: { contains: "main", mode: "insensitive" } },
      ])
    );
  });

  it("returns 400 for invalid pagination values", async () => {
    authenticate([{ resource: "hub", action: "read" }]);

    const res = await request(app)
      .get("/hubs?limit=1000")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.hub.findMany).not.toHaveBeenCalled();
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app).get("/hubs");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when the role lacks hub:read", async () => {
    authenticate([{ resource: "hub", action: "create" }]);

    const res = await request(app)
      .get("/hubs")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.hub.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /hubs/:id", () => {
  it("returns a hub with relevant relationship counts", async () => {
    authenticate([{ resource: "hub", action: "read" }]);
    prismaMock.hub.findFirst.mockResolvedValue(existingHub());
    prismaMock.hub.findUnique.mockResolvedValue(
      existingHub({ _count: { vehicles: 2, staff: 1, riders: 3 } })
    );

    const res = await request(app)
      .get(`/hubs/${HUB_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.hub._count).toEqual({
      vehicles: 2,
      staff: 1,
      riders: 3,
    });
  });

  it("returns 404 when the hub does not exist", async () => {
    authenticate([{ resource: "hub", action: "read" }]);
    prismaMock.hub.findFirst.mockResolvedValue(existingHub());
    prismaMock.hub.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/hubs/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid identifier", async () => {
    authenticate([{ resource: "hub", action: "read" }]);

    const res = await request(app)
      .get("/hubs/not-a-uuid")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.hub.findFirst).not.toHaveBeenCalled();
  });
});

describe("PATCH /hubs/:id", () => {
  it("updates a hub and records before/after audit data", async () => {
    authenticate([{ resource: "hub", action: "update" }]);
    const oldHub = existingHub();
    prismaMock.hub.findFirst.mockResolvedValue(oldHub);
    prismaMock.hub.findUnique.mockResolvedValue(oldHub);
    prismaMock.hub.update.mockResolvedValue(
      existingHub({ name: "Renamed Hub" })
    );

    const res = await request(app)
      .patch(`/hubs/${HUB_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Renamed Hub" });

    expect(res.status).toBe(200);
    expect(res.body.data.hub.name).toBe("Renamed Hub");
    expect(prismaMock.hub.update).toHaveBeenCalledWith({
      where: { id: HUB_ID },
      data: { name: "Renamed Hub" },
    });

    const audit = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      action: "UPDATE",
      resource: "Hub",
      resourceId: HUB_ID,
    });
    expect(audit.changes.name).toEqual({
      old: "Main Hub",
      new: "Renamed Hub",
    });
  });

  it("returns 400 for an invalid update payload", async () => {
    authenticate([{ resource: "hub", action: "update" }]);
    prismaMock.hub.findFirst.mockResolvedValue(existingHub());

    const res = await request(app)
      .patch(`/hubs/${HUB_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ contactEmail: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.hub.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the update would duplicate a unique value", async () => {
    authenticate([{ resource: "hub", action: "update" }]);
    prismaMock.hub.findFirst.mockResolvedValue(existingHub());
    prismaMock.hub.findUnique.mockResolvedValue(existingHub());
    prismaMock.hub.update.mockRejectedValue({ code: "P2002" });

    const res = await request(app)
      .patch(`/hubs/${HUB_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ code: "OTHER" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("returns 404 when updating a nonexistent hub", async () => {
    authenticate([{ resource: "hub", action: "update" }]);
    prismaMock.hub.findFirst.mockResolvedValue(existingHub());
    prismaMock.hub.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/hubs/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Nope" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prismaMock.hub.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks hub:update", async () => {
    authenticate([{ resource: "hub", action: "read" }]);

    const res = await request(app)
      .patch(`/hubs/${HUB_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Nope" });

    expect(res.status).toBe(403);
    expect(prismaMock.hub.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /hubs/:id", () => {
  it("deletes an unreferenced hub and writes an audit record", async () => {
    authenticate([{ resource: "hub", action: "delete" }]);
    prismaMock.hub.findFirst.mockResolvedValue(existingHub());
    prismaMock.hub.findUnique.mockResolvedValue(
      existingHub({ _count: emptyCounts })
    );
    prismaMock.hub.delete.mockResolvedValue(existingHub());

    const res = await request(app)
      .delete(`/hubs/${HUB_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe("Hub deleted successfully");
    expect(prismaMock.hub.delete).toHaveBeenCalledWith({
      where: { id: HUB_ID },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DELETE",
        resource: "Hub",
        resourceId: HUB_ID,
      }),
    });
  });

  it("refuses to delete a hub that still has dependent records", async () => {
    authenticate([{ resource: "hub", action: "delete" }]);
    prismaMock.hub.findFirst.mockResolvedValue(existingHub());
    prismaMock.hub.findUnique.mockResolvedValue(
      existingHub({ _count: { ...emptyCounts, vehicles: 1 } })
    );

    const res = await request(app)
      .delete(`/hubs/${HUB_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.hub.delete).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 404 when deleting a nonexistent hub", async () => {
    authenticate([{ resource: "hub", action: "delete" }]);
    prismaMock.hub.findFirst.mockResolvedValue(existingHub());
    prismaMock.hub.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .delete(`/hubs/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 when the role lacks hub:delete", async () => {
    authenticate([{ resource: "hub", action: "update" }]);

    const res = await request(app)
      .delete(`/hubs/${HUB_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.hub.delete).not.toHaveBeenCalled();
  });
});
