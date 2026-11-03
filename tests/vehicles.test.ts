import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const VEHICLE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c";
const HUB_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const OTHER_HUB_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";
const HISTORY_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f";

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

function existingVehicle(overrides: Record<string, unknown> = {}) {
  return {
    id: VEHICLE_ID,
    registrationNumber: "KA01AB1234",
    hubId: null,
    make: "Honda",
    model: "Activa",
    year: 2022,
    color: "White",
    vin: "VIN-0001",
    status: "IDLE",
    acquiredAt: null,
    retiredAt: null,
    isActive: true,
    version: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function existingHistory(overrides: Record<string, unknown> = {}) {
  return {
    id: HISTORY_ID,
    vehicleId: VEHICLE_ID,
    previousStatus: "IDLE",
    status: "DEPLOYED",
    changedById: "u1",
    reason: "Allocated to rider",
    notes: null,
    changedAt: new Date("2026-01-02T00:00:00.000Z"),
    changedBy: { id: "u1", name: "Tester" },
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.hub.findUnique.mockReset();
  prismaMock.vehicle.findUnique.mockReset();
  prismaMock.vehicle.findFirst.mockReset();
  prismaMock.vehicle.findMany.mockReset();
  prismaMock.vehicle.count.mockReset();
  prismaMock.vehicle.create.mockReset();
  prismaMock.vehicle.update.mockReset();
  prismaMock.vehicle.updateMany.mockReset();
  prismaMock.vehicle.delete.mockReset();
  prismaMock.vehicleStatusHistory.findMany.mockReset();
  prismaMock.vehicleStatusHistory.count.mockReset();
  prismaMock.vehicleStatusHistory.create.mockReset();
  prismaMock.vehicleAssignment.count.mockReset();
  prismaMock.service.count.mockReset();
  prismaMock.auditLog.create.mockReset();
});

describe("POST /vehicles", () => {
  it("creates a vehicle with its hub relation and writes an audit record", async () => {
    authenticate([{ resource: "vehicle", action: "create" }]);
    prismaMock.hub.findUnique.mockResolvedValue({ id: HUB_ID });
    prismaMock.vehicle.create.mockResolvedValue(
      existingVehicle({ hubId: HUB_ID, status: "IDLE" })
    );

    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        registrationNumber: "KA01AB1234",
        hubId: HUB_ID,
        make: "Honda",
        model: "Activa",
        year: 2022,
        color: "White",
        vin: "VIN-0001",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { vehicle: { id: VEHICLE_ID, registrationNumber: "KA01AB1234" } },
    });
    expect(prismaMock.vehicle.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        registrationNumber: "KA01AB1234",
        hubId: HUB_ID,
        make: "Honda",
        model: "Activa",
        year: 2022,
        color: "White",
        vin: "VIN-0001",
        status: "IDLE",
        isActive: true,
      }),
      select: expect.any(Object),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        resource: "Vehicle",
        resourceId: VEHICLE_ID,
      }),
    });
  });

  it("returns 400 for a missing registration number without touching the database", async () => {
    authenticate([{ resource: "vehicle", action: "create" }]);

    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ make: "Honda" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
  });

  it("rejects system-managed fields such as status on create", async () => {
    authenticate([{ resource: "vehicle", action: "create" }]);

    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ registrationNumber: "KA01AB1234", status: "RETIRED" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
  });

  it("returns 409 for a duplicate registration number or VIN", async () => {
    authenticate([{ resource: "vehicle", action: "create" }]);
    prismaMock.vehicle.create.mockRejectedValue({ code: "P2002" });

    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ registrationNumber: "KA01AB1234" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the referenced hub does not exist", async () => {
    authenticate([{ resource: "vehicle", action: "create" }]);
    prismaMock.hub.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ registrationNumber: "KA01AB1234", hubId: HUB_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Hub not found");
    expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app)
      .post("/vehicles")
      .send({ registrationNumber: "KA01AB1234" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when the role lacks vehicle:create", async () => {
    authenticate([{ resource: "vehicle", action: "read" }]);

    const res = await request(app)
      .post("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ registrationNumber: "KA01AB1234" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.vehicle.create).not.toHaveBeenCalled();
  });
});

describe("GET /vehicles", () => {
  it("lists non-deleted vehicles with a pagination envelope", async () => {
    authenticate([{ resource: "vehicle", action: "read" }]);
    prismaMock.vehicle.findMany.mockResolvedValue([existingVehicle()]);
    prismaMock.vehicle.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.vehicles).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    const args = prismaMock.vehicle.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ deletedAt: null });
    expect(args).toMatchObject({ skip: 0, take: 20 });
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("applies pagination, search, status, hub and sorting filters", async () => {
    authenticate([{ resource: "vehicle", action: "read" }]);
    prismaMock.vehicle.findMany.mockResolvedValue([]);
    prismaMock.vehicle.count.mockResolvedValue(11);

    const res = await request(app)
      .get(
        `/vehicles?page=2&limit=5&search=KA01&status=IDLE&hubId=${HUB_ID}&make=Honda&sortBy=registrationNumber&sortOrder=asc`
      )
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toMatchObject({
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3,
    });

    const args = prismaMock.vehicle.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 5, take: 5 });
    expect(args.where).toMatchObject({
      deletedAt: null,
      status: "IDLE",
      hubId: HUB_ID,
      make: { equals: "Honda", mode: "insensitive" },
    });
    expect(args.where.OR).toEqual(
      expect.arrayContaining([
        { registrationNumber: { contains: "KA01", mode: "insensitive" } },
        { vin: { contains: "KA01", mode: "insensitive" } },
        { make: { contains: "KA01", mode: "insensitive" } },
        { model: { contains: "KA01", mode: "insensitive" } },
      ])
    );
    expect(args.orderBy).toEqual({ registrationNumber: "asc" });
  });

  it("returns 400 for invalid filters and pagination", async () => {
    authenticate([{ resource: "vehicle", action: "read" }]);

    const invalidStatus = await request(app)
      .get("/vehicles?status=UNKNOWN")
      .set("Authorization", `Bearer ${accessToken()}`);
    expect(invalidStatus.status).toBe(400);
    expect(invalidStatus.body.error.code).toBe("VALIDATION_ERROR");

    const invalidLimit = await request(app)
      .get("/vehicles?limit=1000")
      .set("Authorization", `Bearer ${accessToken()}`);
    expect(invalidLimit.status).toBe(400);
    expect(prismaMock.vehicle.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks vehicle:read", async () => {
    authenticate([{ resource: "vehicle", action: "update" }]);

    const res = await request(app)
      .get("/vehicles")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.vehicle.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /vehicles/:id", () => {
  it("returns a vehicle with its hub and relationship counts", async () => {
    authenticate([{ resource: "vehicle", action: "read" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(
      existingVehicle({
        hubId: HUB_ID,
        hub: { id: HUB_ID, name: "Main Hub", code: "MAIN", isActive: true },
        _count: { assignments: 1, services: 0, documents: 2, statusHistory: 3 },
      })
    );

    const res = await request(app)
      .get(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.vehicle.hub).toEqual({
      id: HUB_ID,
      name: "Main Hub",
      code: "MAIN",
      isActive: true,
    });
    expect(res.body.data.vehicle._count.statusHistory).toBe(3);
    expect(res.body.data.vehicle).not.toHaveProperty("deletedAt");
  });

  it("returns 404 for a nonexistent vehicle", async () => {
    authenticate([{ resource: "vehicle", action: "read" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/vehicles/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a soft-deleted vehicle", async () => {
    authenticate([{ resource: "vehicle", action: "read" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(
      existingVehicle({ deletedAt: new Date() })
    );
    prismaMock.vehicle.findUnique.mockResolvedValue(
      existingVehicle({ deletedAt: new Date() })
    );

    const res = await request(app)
      .get(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid identifier", async () => {
    authenticate([{ resource: "vehicle", action: "read" }]);

    const res = await request(app)
      .get("/vehicles/not-a-uuid")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.vehicle.findFirst).not.toHaveBeenCalled();
  });
});

describe("PATCH /vehicles/:id", () => {
  it("updates allowed fields and records before/after audit data", async () => {
    authenticate([{ resource: "vehicle", action: "update" }]);
    const oldVehicle = existingVehicle();
    prismaMock.vehicle.findFirst.mockResolvedValue(oldVehicle);
    prismaMock.vehicle.findUnique.mockResolvedValue(oldVehicle);
    prismaMock.vehicle.update.mockResolvedValue(
      existingVehicle({ make: "TVS", model: "Jupiter" })
    );

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ make: "TVS", model: "Jupiter" });

    expect(res.status).toBe(200);
    expect(res.body.data.vehicle.make).toBe("TVS");
    expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
      where: { id: VEHICLE_ID },
      data: { make: "TVS", model: "Jupiter" },
      select: expect.any(Object),
    });

    const audit = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      action: "UPDATE",
      resource: "Vehicle",
      resourceId: VEHICLE_ID,
    });
    expect(audit.changes.make).toEqual({ old: "Honda", new: "TVS" });
  });

  it("returns 400 when attempting to update the protected status field", async () => {
    authenticate([{ resource: "vehicle", action: "update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "DEPLOYED" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the update would duplicate a registration number", async () => {
    authenticate([{ resource: "vehicle", action: "update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.update.mockRejectedValue({ code: "P2002" });

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ registrationNumber: "KA01AB9999" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("returns 404 when changing to a hub that does not exist", async () => {
    authenticate([{ resource: "vehicle", action: "update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(existingVehicle());
    prismaMock.hub.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ hubId: OTHER_HUB_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Hub not found");
    expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
  });

  it("returns 404 when updating a nonexistent vehicle", async () => {
    authenticate([{ resource: "vehicle", action: "update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/vehicles/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ make: "TVS" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 when the role lacks vehicle:update", async () => {
    authenticate([{ resource: "vehicle", action: "read" }]);

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ make: "TVS" });

    expect(res.status).toBe(403);
    expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /vehicles/:id", () => {
  it("soft-deletes a vehicle without removing its history", async () => {
    authenticate([{ resource: "vehicle", action: "delete" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(existingVehicle());
    prismaMock.vehicleAssignment.count.mockResolvedValue(0);
    prismaMock.service.count.mockResolvedValue(0);
    prismaMock.vehicle.update.mockResolvedValue(
      existingVehicle({ deletedAt: new Date("2026-01-03T00:00:00.000Z") })
    );

    const res = await request(app)
      .delete(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe("Vehicle deleted successfully");
    expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
      where: { id: VEHICLE_ID },
      data: { deletedAt: expect.any(Date) },
      select: expect.any(Object),
    });
    expect(prismaMock.vehicle.delete).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DELETE",
        resource: "Vehicle",
        resourceId: VEHICLE_ID,
      }),
    });
  });

  it("refuses to delete a vehicle with an active assignment", async () => {
    authenticate([{ resource: "vehicle", action: "delete" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(existingVehicle());
    prismaMock.vehicleAssignment.count.mockResolvedValue(1);
    prismaMock.service.count.mockResolvedValue(0);

    const res = await request(app)
      .delete(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("refuses to delete a vehicle with an open service record", async () => {
    authenticate([{ resource: "vehicle", action: "delete" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(existingVehicle());
    prismaMock.vehicleAssignment.count.mockResolvedValue(0);
    prismaMock.service.count.mockResolvedValue(1);

    const res = await request(app)
      .delete(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
  });

  it("returns 404 when deleting an already deleted vehicle", async () => {
    authenticate([{ resource: "vehicle", action: "delete" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(
      existingVehicle({ deletedAt: new Date() })
    );
    prismaMock.vehicle.findUnique.mockResolvedValue(
      existingVehicle({ deletedAt: new Date() })
    );

    const res = await request(app)
      .delete(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 when the role lacks vehicle:delete", async () => {
    authenticate([{ resource: "vehicle", action: "update" }]);

    const res = await request(app)
      .delete(`/vehicles/${VEHICLE_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /vehicles/:id/status", () => {
  it("changes status and writes history in the same transaction", async () => {
    authenticate([{ resource: "vehicle", action: "status:update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(existingVehicle());
    prismaMock.vehicleAssignment.count.mockResolvedValue(0);
    prismaMock.vehicle.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.vehicleStatusHistory.create.mockResolvedValue(
      existingHistory({ reason: "Allocated to rider" })
    );

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "DEPLOYED", reason: "Allocated to rider" });

    expect(res.status).toBe(200);
    expect(res.body.data.vehicle.status).toBe("DEPLOYED");
    expect(res.body.data.statusHistory).toMatchObject({
      previousStatus: "IDLE",
      status: "DEPLOYED",
      changedById: "u1",
      reason: "Allocated to rider",
    });

    expect(prismaMock.vehicle.updateMany).toHaveBeenCalledWith({
      where: {
        id: VEHICLE_ID,
        status: "IDLE",
        version: 0,
        deletedAt: null,
      },
      data: { status: "DEPLOYED", version: { increment: 1 } },
    });
    expect(prismaMock.vehicleStatusHistory.create).toHaveBeenCalledWith({
      data: {
        vehicleId: VEHICLE_ID,
        previousStatus: "IDLE",
        status: "DEPLOYED",
        changedById: "u1",
        reason: "Allocated to rider",
        notes: null,
      },
      include: { changedBy: { select: expect.any(Object) } },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATE",
        resource: "Vehicle",
        resourceId: VEHICLE_ID,
      }),
    });
  });

  it("returns 400 for an invalid status value", async () => {
    authenticate([{ resource: "vehicle", action: "status:update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "FLYING" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an invalid transition", async () => {
    authenticate([{ resource: "vehicle", action: "status:update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(
      existingVehicle({ status: "RETIRED" })
    );
    prismaMock.vehicle.findUnique.mockResolvedValue(
      existingVehicle({ status: "RETIRED" })
    );

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "DEPLOYED" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.vehicle.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.vehicleStatusHistory.create).not.toHaveBeenCalled();
  });

  it("rejects a repeated transition to the current status", async () => {
    authenticate([{ resource: "vehicle", action: "status:update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(existingVehicle());

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "IDLE" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.vehicleStatusHistory.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the vehicle does not exist", async () => {
    authenticate([{ resource: "vehicle", action: "status:update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/vehicles/${MISSING_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "DEPLOYED" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("blocks a status change while an active assignment exists", async () => {
    authenticate([{ resource: "vehicle", action: "status:update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(
      existingVehicle({ status: "DEPLOYED" })
    );
    prismaMock.vehicle.findUnique.mockResolvedValue(
      existingVehicle({ status: "DEPLOYED" })
    );
    prismaMock.vehicleAssignment.count.mockResolvedValue(1);

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "IDLE" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.vehicle.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.vehicleStatusHistory.create).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks vehicle:status:update", async () => {
    authenticate([{ resource: "vehicle", action: "update" }]);

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "DEPLOYED" });

    expect(res.status).toBe(403);
    expect(prismaMock.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it("does not write history or an audit row when history insertion fails", async () => {
    authenticate([{ resource: "vehicle", action: "status:update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(existingVehicle());
    prismaMock.vehicleAssignment.count.mockResolvedValue(0);
    prismaMock.vehicle.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.vehicleStatusHistory.create.mockRejectedValue(
      new Error("history insert failed")
    );

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "IN_SERVICE" });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("rejects a stale concurrent update without writing history", async () => {
    authenticate([{ resource: "vehicle", action: "status:update" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(existingVehicle());
    prismaMock.vehicleAssignment.count.mockResolvedValue(0);
    prismaMock.vehicle.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .patch(`/vehicles/${VEHICLE_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "DEPLOYED" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.vehicleStatusHistory.create).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("GET /vehicles/:id/status-history", () => {
  it("returns newest-first history for the requested vehicle", async () => {
    authenticate([{ resource: "vehicle", action: "history:read" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      deletedAt: null,
    });
    prismaMock.vehicleStatusHistory.findMany.mockResolvedValue([
      existingHistory(),
    ]);
    prismaMock.vehicleStatusHistory.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/vehicles/${VEHICLE_ID}/status-history`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.statusHistory).toHaveLength(1);
    expect(res.body.data.statusHistory[0]).toMatchObject({
      previousStatus: "IDLE",
      status: "DEPLOYED",
      changedBy: { id: "u1", name: "Tester" },
    });
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    const args = prismaMock.vehicleStatusHistory.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ vehicleId: VEHICLE_ID });
    expect(args.orderBy).toEqual([{ changedAt: "desc" }, { id: "desc" }]);
    expect(args.include.changedBy.select).toEqual({ id: true, name: true });
  });

  it("returns an empty collection when no history exists", async () => {
    authenticate([{ resource: "vehicle", action: "history:read" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      deletedAt: null,
    });
    prismaMock.vehicleStatusHistory.findMany.mockResolvedValue([]);
    prismaMock.vehicleStatusHistory.count.mockResolvedValue(0);

    const res = await request(app)
      .get(`/vehicles/${VEHICLE_ID}/status-history`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.statusHistory).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it("returns 404 when the vehicle does not exist", async () => {
    authenticate([{ resource: "vehicle", action: "history:read" }]);
    prismaMock.vehicle.findFirst.mockResolvedValue(existingVehicle());
    prismaMock.vehicle.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/vehicles/${MISSING_ID}/status-history`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prismaMock.vehicleStatusHistory.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks vehicle:history:read", async () => {
    authenticate([{ resource: "vehicle", action: "read" }]);

    const res = await request(app)
      .get(`/vehicles/${VEHICLE_ID}/status-history`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.vehicleStatusHistory.findMany).not.toHaveBeenCalled();
  });
});
