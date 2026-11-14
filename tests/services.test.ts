import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const SERVICE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c01";
const VEHICLE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c02";
const RENTAL_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4c03";

function authUser(
  permissions: { resource: string; action: string }[],
  role = "ADMIN"
) {
  return {
    id: "u1",
    name: "Tester",
    status: "ACTIVE",
    role: { name: role, permissions },
  };
}

function authenticate(
  permissions: { resource: string; action: string }[],
  role = "ADMIN"
) {
  prismaMock.user.findUnique.mockResolvedValue(authUser(permissions, role));
}

function serviceDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: SERVICE_ID,
    serviceNumber: "SVC-ABC123",
    vehicleId: VEHICLE_ID,
    rentalId: RENTAL_ID,
    serviceType: "TECHNICAL",
    status: "REPORTED",
    responsibleParty: "UNKNOWN",
    reportedById: "u1",
    approvedById: null,
    assignedToId: null,
    reportedAt: new Date("2026-01-01T00:00:00.000Z"),
    startedAt: null,
    completedAt: null,
    closedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    downtimeStart: null,
    downtimeEnd: null,
    downtimeReason: null,
    previousVehicleStatus: "DEPLOYED",
    description: "Brake issue",
    diagnosis: null,
    repairNotes: null,
    resolutionNotes: null,
    responsibilityApprovedAt: null,
    responsibilityInvestigationNotes: null,
    responsibilityEvidence: null,
    replacementVehicleId: null,
    version: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    vehicle: {
      id: VEHICLE_ID,
      registrationNumber: "KA01AB1234",
      make: "Honda",
      model: "Activa",
      status: "DEPLOYED",
      hubId: null,
      isActive: true,
      version: 0,
    },
    rental: {
      id: RENTAL_ID,
      rentalNumber: "RN-ABC123",
      status: "ACTIVE",
      rentalType: "B2C",
      clientId: null,
      riderId: null,
      hubId: null,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: null,
      currency: "INR",
    },
    reportedBy: { id: "u1", name: "Tester", email: "t@example.com" },
    approvedBy: null,
    assignedTo: null,
    replacementVehicle: null,
    rentalPause: null,
    charges: [],
    spares: [],
    replacementAssignments: [],
    _count: {
      charges: 0,
      spares: 0,
      replacementAssignments: 0,
    },
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(prismaMock).forEach((delegate: any) => {
    if (delegate && typeof delegate === "object") {
      Object.values(delegate).forEach((fn: any) => {
        if (typeof fn?.mockReset === "function") fn.mockReset();
      });
    }
  });
  prismaMock.auditLog.create.mockResolvedValue({});  prismaMock.service.findMany.mockResolvedValue([]);
  prismaMock.service.count.mockResolvedValue(0);  prismaMock.rentalPause.create.mockResolvedValue({ id: "pause1" });
  prismaMock.rentalPause.update.mockResolvedValue({ id: "pause1" });
});

describe("POST /services", () => {
  it("reports a service and returns a human-readable service number", async () => {
    authenticate([{ resource: "service", action: "create" }]);
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      registrationNumber: "KA01AB1234",
      status: "DEPLOYED",
      hubId: null,
      isActive: true,
      version: 0,
      deletedAt: null,
    });
    prismaMock.rental.findUnique.mockResolvedValue({
      id: RENTAL_ID,
      rentalNumber: "RN-ABC123",
      status: "ACTIVE",
      version: 0,
      rentalType: "B2C",
      clientId: null,
      riderId: null,
      hubId: null,
    });
    prismaMock.vehicleAssignment.count.mockResolvedValue(1);
    prismaMock.service.create.mockResolvedValue(serviceDetail());

    const res = await request(app)
      .post("/services")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        vehicleId: VEHICLE_ID,
        rentalId: RENTAL_ID,
        serviceType: "TECHNICAL",
        description: "Brake issue",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.service).toMatchObject({
      id: SERVICE_ID,
      status: "REPORTED",
    });
    expect(prismaMock.service.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          vehicleId: VEHICLE_ID,
          rentalId: RENTAL_ID,
          status: "REPORTED",
          previousVehicleStatus: "DEPLOYED",
        }),
      })
    );
  });

  it("rejects a service attached to a rental without an active vehicle assignment", async () => {
    authenticate([{ resource: "service", action: "create" }]);
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      registrationNumber: "KA01AB1234",
      status: "DEPLOYED",
      hubId: null,
      isActive: true,
      version: 0,
      deletedAt: null,
    });
    prismaMock.rental.findUnique.mockResolvedValue({
      id: RENTAL_ID,
      rentalNumber: "RN-ABC123",
      status: "ACTIVE",
      version: 0,
      rentalType: "B2C",
      clientId: null,
      riderId: null,
      hubId: null,
    });
    prismaMock.vehicleAssignment.count.mockResolvedValue(0);

    const res = await request(app)
      .post("/services")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        vehicleId: VEHICLE_ID,
        rentalId: RENTAL_ID,
        serviceType: "TECHNICAL",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/not actively assigned/i);
  });
});

describe("PATCH /services/:id/start", () => {
  it("starts downtime, moves the vehicle to IN_SERVICE and pauses the rental", async () => {
    authenticate([{ resource: "service", action: "start" }]);
    const started = serviceDetail({
      status: "IN_PROGRESS",
      startedAt: new Date("2026-01-02T00:00:00.000Z"),
      downtimeStart: new Date("2026-01-02T00:00:00.000Z"),
    });

    prismaMock.service.findFirst.mockResolvedValue(started);
    prismaMock.service.findUnique.mockResolvedValue(
      serviceDetail({
        status: "REPORTED",
        rental: started.rental,
      })
    );
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      registrationNumber: "KA01AB1234",
      status: "DEPLOYED",
      hubId: null,
      isActive: true,
      version: 0,
      deletedAt: null,
    });
    prismaMock.rental.findUnique.mockResolvedValue({
      id: RENTAL_ID,
      rentalNumber: "RN-ABC123",
      status: "ACTIVE",
      version: 0,
    });
    prismaMock.rentalPause.findUnique.mockResolvedValue(null);
    prismaMock.service.findUniqueOrThrow.mockResolvedValue(started);

    const res = await request(app)
      .patch(`/services/${SERVICE_ID}/start`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.service.status).toBe("IN_PROGRESS");
    expect(prismaMock.service.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "IN_PROGRESS",
          downtimeStart: expect.any(Date),
        }),
      })
    );
    expect(prismaMock.vehicle.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "IN_SERVICE" }),
      })
    );
    expect(prismaMock.rental.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ON_HOLD" }),
      })
    );
    expect(prismaMock.rentalPause.create).toHaveBeenCalled();
  });
});

describe("POST /services/:id/approve-responsibility", () => {
  it("requires an ADMIN or SUPERVISOR role", async () => {
    authenticate(
      [{ resource: "service", action: "approve-responsibility" }],
      "OPERATOR"
    );
    prismaMock.service.findFirst.mockResolvedValue(serviceDetail());

    const res = await request(app)
      .post(`/services/${SERVICE_ID}/approve-responsibility`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        responsibility: "RIDER",
        investigationNotes: "Rider admitted fault",
      });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/ADMIN or SUPERVISOR/i);
  });
});

describe("PATCH /services/:id/awaiting-parts and /resume", () => {
  it("moves an in-progress service to awaiting parts without touching downtime", async () => {
    authenticate([{ resource: "service", action: "await-parts" }]);
    prismaMock.service.findFirst.mockResolvedValue({
      id: SERVICE_ID,
      status: "IN_PROGRESS",
    });
    prismaMock.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      serviceNumber: "SVC-ABC123",
      status: "IN_PROGRESS",
      version: 0,
    });
    prismaMock.service.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.service.findUniqueOrThrow.mockResolvedValue(
      serviceDetail({ status: "AWAITING_PARTS" })
    );

    const res = await request(app)
      .patch(`/services/${SERVICE_ID}/awaiting-parts`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ reason: "Waiting for brake pads" });

    expect(res.status).toBe(200);
    expect(res.body.data.service.status).toBe("AWAITING_PARTS");
    expect(prismaMock.service.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: "AWAITING_PARTS",
          statusChangedAt: expect.any(Date),
          version: { increment: 1 },
        },
      })
    );
  });

  it("resumes work from awaiting parts", async () => {
    authenticate([{ resource: "service", action: "resume" }]);
    prismaMock.service.findFirst.mockResolvedValue({
      id: SERVICE_ID,
      status: "AWAITING_PARTS",
    });
    prismaMock.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      serviceNumber: "SVC-ABC123",
      status: "AWAITING_PARTS",
      version: 1,
    });
    prismaMock.service.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.service.findUniqueOrThrow.mockResolvedValue(
      serviceDetail({ status: "IN_PROGRESS" })
    );

    const res = await request(app)
      .patch(`/services/${SERVICE_ID}/resume`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.service.status).toBe("IN_PROGRESS");
    expect(prismaMock.service.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: "IN_PROGRESS",
          statusChangedAt: expect.any(Date),
          version: { increment: 1 },
        },
      })
    );
  });

  it("rejects awaiting parts when the service is not in progress", async () => {
    authenticate([{ resource: "service", action: "await-parts" }]);
    prismaMock.service.findFirst.mockResolvedValue({
      id: SERVICE_ID,
      status: "REPORTED",
    });
    prismaMock.service.findUnique.mockResolvedValue({
      id: SERVICE_ID,
      serviceNumber: "SVC-ABC123",
      status: "REPORTED",
      version: 0,
    });

    const res = await request(app)
      .patch(`/services/${SERVICE_ID}/awaiting-parts`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/cannot await parts/i);
    expect(prismaMock.service.updateMany).not.toHaveBeenCalled();
  });
});
