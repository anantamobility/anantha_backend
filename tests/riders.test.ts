import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const RIDER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c";
const HUB_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const CLIENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";
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

function existingRider(overrides: Record<string, unknown> = {}) {
  return {
    id: RIDER_ID,
    userId: null,
    riderCode: "RDR-ABC12345",
    fullName: "Ravi Kumar",
    phoneNumber: "9876543210",
    email: "ravi@example.com",
    dateOfBirth: null,
    gender: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    rentalType: "B2C",
    b2cMode: "INDIVIDUAL_RIDER",
    b2bRiderMgmt: null,
    clientId: null,
    hubId: null,
    status: "ONBOARDING",
    onboardedAt: new Date("2026-01-01T00:00:00.000Z"),
    statusChangedAt: new Date("2026-01-01T00:00:00.000Z"),
    version: 0,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    user: null,
    client: null,
    hub: null,
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.hub.findUnique.mockReset();
  prismaMock.client.findUnique.mockReset();
  prismaMock.rider.findUnique.mockReset();
  prismaMock.rider.findFirst.mockReset();
  prismaMock.rider.findMany.mockReset();
  prismaMock.rider.count.mockReset();
  prismaMock.rider.create.mockReset();
  prismaMock.rider.update.mockReset();
  prismaMock.rider.updateMany.mockReset();
  prismaMock.auditLog.create.mockReset();
});

describe("POST /riders", () => {
  it("onboards a B2C rider", async () => {
    authenticate([{ resource: "rider", action: "create" }]);
    prismaMock.hub.findUnique.mockResolvedValue({ id: HUB_ID });
    prismaMock.rider.create.mockResolvedValue(
      existingRider({ hubId: HUB_ID })
    );

    const res = await request(app)
      .post("/riders")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        fullName: "Ravi Kumar",
        phoneNumber: "9876543210",
        email: "ravi@example.com",
        rentalType: "B2C",
        b2cMode: "INDIVIDUAL_RIDER",
        hubId: HUB_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { rider: { id: RIDER_ID, fullName: "Ravi Kumar" } },
    });
    expect(prismaMock.rider.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fullName: "Ravi Kumar",
        phoneNumber: "9876543210",
        rentalType: "B2C",
        b2cMode: "INDIVIDUAL_RIDER",
        status: "ONBOARDING",
        statusChangedAt: expect.any(Date),
      }),
      select: expect.any(Object),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        resource: "Rider",
        resourceId: RIDER_ID,
      }),
    });
  });

  it("onboards a B2B client-managed rider linked to a client", async () => {
    authenticate([{ resource: "rider", action: "create" }]);
    prismaMock.client.findUnique.mockResolvedValue({ id: CLIENT_ID });
    prismaMock.rider.create.mockResolvedValue(
      existingRider({
        rentalType: "B2B",
        b2cMode: null,
        b2bRiderMgmt: "CLIENT_MANAGED",
        clientId: CLIENT_ID,
      })
    );

    const res = await request(app)
      .post("/riders")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        fullName: "Ravi Kumar",
        phoneNumber: "9876543210",
        rentalType: "B2B",
        b2bRiderMgmt: "CLIENT_MANAGED",
        clientId: CLIENT_ID,
      });

    expect(res.status).toBe(201);
    expect(prismaMock.rider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rentalType: "B2B",
          b2bRiderMgmt: "CLIENT_MANAGED",
          clientId: CLIENT_ID,
          b2cMode: null,
        }),
      })
    );
  });

  it("returns 400 for missing required fields", async () => {
    authenticate([{ resource: "rider", action: "create" }]);

    const res = await request(app)
      .post("/riders")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ fullName: "Ravi Kumar" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rider.create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid email and phone", async () => {
    authenticate([{ resource: "rider", action: "create" }]);

    const invalidEmail = await request(app)
      .post("/riders")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        fullName: "Ravi Kumar",
        phoneNumber: "9876543210",
        email: "not-an-email",
        rentalType: "B2C",
        b2cMode: "INDIVIDUAL_RIDER",
      });

    expect(invalidEmail.status).toBe(400);
    expect(invalidEmail.body.error.code).toBe("VALIDATION_ERROR");

    const invalidPhone = await request(app)
      .post("/riders")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        fullName: "Ravi Kumar",
        phoneNumber: "abc",
        rentalType: "B2C",
        b2cMode: "INDIVIDUAL_RIDER",
      });

    expect(invalidPhone.status).toBe(400);
    expect(prismaMock.rider.create).not.toHaveBeenCalled();
  });

  it("rejects inconsistent B2C/B2B classifications", async () => {
    authenticate([{ resource: "rider", action: "create" }]);

    const noB2cMode = await request(app)
      .post("/riders")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        fullName: "Ravi Kumar",
        phoneNumber: "9876543210",
        rentalType: "B2C",
      });
    expect(noB2cMode.status).toBe(400);

    const b2bWithoutClient = await request(app)
      .post("/riders")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        fullName: "Ravi Kumar",
        phoneNumber: "9876543210",
        rentalType: "B2B",
        b2bRiderMgmt: "AML_MANAGED",
      });
    expect(b2bWithoutClient.status).toBe(400);
    expect(prismaMock.rider.create).not.toHaveBeenCalled();
  });

  it("returns 409 for a duplicate rider code or user", async () => {
    authenticate([{ resource: "rider", action: "create" }]);
    prismaMock.rider.create.mockRejectedValue({ code: "P2002" });

    const res = await request(app)
      .post("/riders")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        fullName: "Ravi Kumar",
        phoneNumber: "9876543210",
        rentalType: "B2C",
        b2cMode: "INDIVIDUAL_RIDER",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the linked hub does not exist", async () => {
    authenticate([{ resource: "rider", action: "create" }]);
    prismaMock.hub.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/riders")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        fullName: "Ravi Kumar",
        phoneNumber: "9876543210",
        rentalType: "B2C",
        b2cMode: "INDIVIDUAL_RIDER",
        hubId: HUB_ID,
      });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Hub not found");
    expect(prismaMock.rider.create).not.toHaveBeenCalled();
  });

  it("returns 401 without authentication and 403 without permission", async () => {
    const unauthenticated = await request(app).post("/riders").send({});
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body.error.code).toBe("UNAUTHORIZED");

    authenticate([{ resource: "rider", action: "read" }]);
    const forbidden = await request(app)
      .post("/riders")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        fullName: "Ravi Kumar",
        phoneNumber: "9876543210",
        rentalType: "B2C",
        b2cMode: "INDIVIDUAL_RIDER",
      });
    expect(forbidden.status).toBe(403);
    expect(prismaMock.rider.create).not.toHaveBeenCalled();
  });
});

describe("GET /riders", () => {
  it("lists non-deleted riders with pagination", async () => {
    authenticate([{ resource: "rider", action: "read" }]);
    prismaMock.rider.findMany.mockResolvedValue([existingRider()]);
    prismaMock.rider.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/riders")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.riders).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });

    const args = prismaMock.rider.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ deletedAt: null });
    expect(args).toMatchObject({ skip: 0, take: 20 });
    expect(args.orderBy).toEqual({ createdAt: "desc" });
  });

  it("applies search, classification, client, hub and sorting filters", async () => {
    authenticate([{ resource: "rider", action: "read" }]);
    prismaMock.rider.findMany.mockResolvedValue([]);
    prismaMock.rider.count.mockResolvedValue(11);

    const res = await request(app)
      .get(
        `/riders?page=2&limit=5&search=ravi&status=ACTIVE&rentalType=B2B&b2bRiderMgmt=CLIENT_MANAGED&clientId=${CLIENT_ID}&hubId=${HUB_ID}&sortBy=fullName&sortOrder=asc`
      )
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toMatchObject({
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3,
    });

    const args = prismaMock.rider.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 5, take: 5 });
    expect(args.where).toMatchObject({
      deletedAt: null,
      status: "ACTIVE",
      rentalType: "B2B",
      b2bRiderMgmt: "CLIENT_MANAGED",
      clientId: CLIENT_ID,
      hubId: HUB_ID,
    });
    expect(args.where.OR).toEqual(
      expect.arrayContaining([
        { fullName: { contains: "ravi", mode: "insensitive" } },
        { riderCode: { contains: "ravi", mode: "insensitive" } },
        { phoneNumber: { contains: "ravi", mode: "insensitive" } },
        { email: { contains: "ravi", mode: "insensitive" } },
      ])
    );
    expect(args.orderBy).toEqual({ fullName: "asc" });
  });

  it("returns 400 for invalid filters", async () => {
    authenticate([{ resource: "rider", action: "read" }]);

    const res = await request(app)
      .get("/riders?status=UNKNOWN&rentalType=WHOLESALE")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rider.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks rider:read", async () => {
    authenticate([{ resource: "rider", action: "update" }]);

    const res = await request(app)
      .get("/riders")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.rider.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /riders/:id", () => {
  it("returns a rider with classification relations and counts", async () => {
    authenticate([{ resource: "rider", action: "read" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(
      existingRider({
        clientId: CLIENT_ID,
        client: {
          id: CLIENT_ID,
          type: "CORPORATE",
          name: "Acme",
          companyName: "Acme Pvt Ltd",
          isActive: true,
        },
        _count: { documents: 1 },
      })
    );

    const res = await request(app)
      .get(`/riders/${RIDER_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rider.client.companyName).toBe("Acme Pvt Ltd");
    expect(res.body.data.rider._count.documents).toBe(1);
    expect(res.body.data.rider).not.toHaveProperty("deletedAt");
  });

  it("returns 404 for a nonexistent or soft-deleted rider", async () => {
    authenticate([{ resource: "rider", action: "read" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(null);

    const missing = await request(app)
      .get(`/riders/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);
    expect(missing.status).toBe(404);

    prismaMock.rider.findFirst.mockResolvedValue(
      existingRider({ deletedAt: new Date() })
    );
    prismaMock.rider.findUnique.mockResolvedValue(
      existingRider({ deletedAt: new Date() })
    );

    const deleted = await request(app)
      .get(`/riders/${RIDER_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);
    expect(deleted.status).toBe(404);
    expect(deleted.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid identifier", async () => {
    authenticate([{ resource: "rider", action: "read" }]);

    const res = await request(app)
      .get("/riders/not-a-uuid")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rider.findFirst).not.toHaveBeenCalled();
  });
});

describe("PATCH /riders/:id", () => {
  it("updates allowed fields and audits the change", async () => {
    authenticate([{ resource: "rider", action: "update" }]);
    const oldRider = existingRider();
    prismaMock.rider.findFirst.mockResolvedValue(oldRider);
    prismaMock.rider.findUnique.mockResolvedValue(oldRider);
    prismaMock.rider.update.mockResolvedValue(
      existingRider({ fullName: "Ravi K", email: "ravi.k@example.com" })
    );

    const res = await request(app)
      .patch(`/riders/${RIDER_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ fullName: "Ravi K", email: "ravi.k@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.data.rider.fullName).toBe("Ravi K");
    expect(prismaMock.rider.update).toHaveBeenCalledWith({
      where: { id: RIDER_ID },
      data: expect.objectContaining({
        fullName: "Ravi K",
        email: "ravi.k@example.com",
      }),
      select: expect.any(Object),
    });

    const audit = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      action: "UPDATE",
      resource: "Rider",
      resourceId: RIDER_ID,
    });
    expect(audit.changes.fullName).toEqual({
      old: "Ravi Kumar",
      new: "Ravi K",
    });
  });

  it("rejects status changes through the general update endpoint", async () => {
    authenticate([{ resource: "rider", action: "update" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());

    const res = await request(app)
      .patch(`/riders/${RIDER_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "ACTIVE" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rider.update).not.toHaveBeenCalled();
  });

  it("rejects an inconsistent classification update", async () => {
    authenticate([{ resource: "rider", action: "update" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());

    const res = await request(app)
      .patch(`/riders/${RIDER_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ b2bRiderMgmt: "CLIENT_MANAGED" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rider.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the update duplicates a unique value", async () => {
    authenticate([{ resource: "rider", action: "update" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.rider.update.mockRejectedValue({ code: "P2002" });

    const res = await request(app)
      .patch(`/riders/${RIDER_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ riderCode: "RDR-DUPLICATE" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("returns 404 when the new client does not exist", async () => {
    authenticate([{ resource: "rider", action: "update" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.client.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/riders/${RIDER_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ clientId: CLIENT_ID });

    expect(res.status).toBe(404);
    expect(res.body.error.message).toBe("Client not found");
    expect(prismaMock.rider.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks rider:update", async () => {
    authenticate([{ resource: "rider", action: "read" }]);

    const res = await request(app)
      .patch(`/riders/${RIDER_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ fullName: "Nope" });

    expect(res.status).toBe(403);
    expect(prismaMock.rider.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /riders/:id/status", () => {
  it("changes status and stamps statusChangedAt", async () => {
    authenticate([{ resource: "rider", action: "status:update" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.rider.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .patch(`/riders/${RIDER_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "ACTIVE", reason: "Documents complete" });

    expect(res.status).toBe(200);
    expect(res.body.data.rider.status).toBe("ACTIVE");
    expect(res.body.data).not.toHaveProperty("statusHistory");

    expect(prismaMock.rider.updateMany).toHaveBeenCalledWith({
      where: {
        id: RIDER_ID,
        status: "ONBOARDING",
        version: 0,
        deletedAt: null,
      },
      data: {
        status: "ACTIVE",
        statusChangedAt: expect.any(Date),
        version: { increment: 1 },
      },
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("returns 400 for an invalid status value", async () => {
    authenticate([{ resource: "rider", action: "status:update" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());

    const res = await request(app)
      .patch(`/riders/${RIDER_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "FLYING" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rider.updateMany).not.toHaveBeenCalled();
  });

  it("rejects invalid and repeated transitions", async () => {
    authenticate([{ resource: "rider", action: "status:update" }]);
    prismaMock.rider.findFirst.mockResolvedValue(
      existingRider({ status: "TERMINATED" })
    );
    prismaMock.rider.findUnique.mockResolvedValue(
      existingRider({ status: "TERMINATED" })
    );

    const invalid = await request(app)
      .patch(`/riders/${RIDER_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "ACTIVE" });
    expect(invalid.status).toBe(409);

    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());

    const repeated = await request(app)
      .patch(`/riders/${RIDER_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "ONBOARDING" });
    expect(repeated.status).toBe(409);
    expect(prismaMock.rider.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a stale concurrent update", async () => {
    authenticate([{ resource: "rider", action: "status:update" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(existingRider());
    prismaMock.rider.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .patch(`/riders/${RIDER_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "ACTIVE" });

    expect(res.status).toBe(409);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing rider and 403 without permission", async () => {
    authenticate([{ resource: "rider", action: "status:update" }]);
    prismaMock.rider.findFirst.mockResolvedValue(existingRider());
    prismaMock.rider.findUnique.mockResolvedValue(null);

    const missing = await request(app)
      .patch(`/riders/${MISSING_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "ACTIVE" });
    expect(missing.status).toBe(404);

    authenticate([{ resource: "rider", action: "update" }]);
    const forbidden = await request(app)
      .patch(`/riders/${RIDER_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "ACTIVE" });
    expect(forbidden.status).toBe(403);
  });
});
