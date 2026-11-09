import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const CLIENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c";
const RATE_CARD_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";

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

function existingClient(overrides: Record<string, unknown> = {}) {
  return {
    id: CLIENT_ID,
    clientCode: "CLI-ABC12345",
    type: "CORPORATE",
    name: "Acme Logistics",
    companyName: "Acme Logistics Pvt Ltd",
    contactPerson: "Jane Doe",
    email: "billing@acme.example",
    phoneNumber: "+919876543210",
    taxId: "29ABCDE1234F1Z5",
    billingAddress: { city: "Bengaluru" },
    paymentTermsDays: 30,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.client.findUnique.mockReset();
  prismaMock.client.findFirst.mockReset();
  prismaMock.client.findMany.mockReset();
  prismaMock.client.count.mockReset();
  prismaMock.client.create.mockReset();
  prismaMock.client.update.mockReset();
  prismaMock.client.updateMany.mockReset();
  prismaMock.rateCard.findMany.mockReset();
  prismaMock.rateCard.count.mockReset();
  prismaMock.rateCardAssignment.findMany.mockReset();
  prismaMock.rateCardAssignment.count.mockReset();
  prismaMock.auditLog.create.mockReset();
});

describe("POST /clients", () => {
  it("creates a client and writes an audit record", async () => {
    authenticate([{ resource: "client", action: "create" }]);
    prismaMock.client.create.mockResolvedValue(existingClient());

    const res = await request(app)
      .post("/clients")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        clientCode: "CLI-ABC12345",
        type: "CORPORATE",
        name: "Acme Logistics",
        companyName: "Acme Logistics Pvt Ltd",
        contactPerson: "Jane Doe",
        email: "billing@acme.example",
        phoneNumber: "+919876543210",
        taxId: "29ABCDE1234F1Z5",
        billingAddress: { city: "Bengaluru" },
        paymentTermsDays: 30,
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { client: { id: CLIENT_ID, clientCode: "CLI-ABC12345" } },
    });
    expect(prismaMock.client.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientCode: "CLI-ABC12345",
        type: "CORPORATE",
        name: "Acme Logistics",
        isActive: true,
      }),
      select: expect.any(Object),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        resource: "Client",
        resourceId: CLIENT_ID,
      }),
    });
  });

  it("generates a client code when one is not supplied", async () => {
    authenticate([{ resource: "client", action: "create" }]);
    prismaMock.client.create.mockResolvedValue(existingClient());

    const res = await request(app)
      .post("/clients")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ type: "INDIVIDUAL", name: "Solo Rider" });

    expect(res.status).toBe(201);
    const data = prismaMock.client.create.mock.calls[0][0].data;
    expect(data.clientCode).toMatch(/^CLI-[A-F0-9]{8}$/);
  });

  it("returns 409 for a duplicate client code", async () => {
    authenticate([{ resource: "client", action: "create" }]);
    prismaMock.client.create.mockRejectedValue({ code: "P2002" });

    const res = await request(app)
      .post("/clients")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        clientCode: "CLI-ABC12345",
        type: "CORPORATE",
        name: "Acme Logistics",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("validates required fields, email, phone and unknown fields", async () => {
    authenticate([{ resource: "client", action: "create" }]);

    const missing = await request(app)
      .post("/clients")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ type: "CORPORATE" });
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("VALIDATION_ERROR");

    const invalid = await request(app)
      .post("/clients")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        type: "CORPORATE",
        name: "Acme",
        email: "not-an-email",
        phoneNumber: "abc",
        status: "ACTIVE",
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });

  it("returns 401 without authentication", async () => {
    const res = await request(app).post("/clients").send({});

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 when the role lacks client:create", async () => {
    authenticate([{ resource: "client", action: "read" }]);

    const res = await request(app)
      .post("/clients")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ type: "CORPORATE", name: "Acme" });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
    expect(prismaMock.client.create).not.toHaveBeenCalled();
  });
});

describe("GET /clients", () => {
  it("lists non-deleted clients with a pagination envelope", async () => {
    authenticate([{ resource: "client", action: "read" }]);
    prismaMock.client.findMany.mockResolvedValue([existingClient()]);
    prismaMock.client.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/clients")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.clients).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(prismaMock.client.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
    });
  });

  it("applies pagination, search, type, active and sorting filters", async () => {
    authenticate([{ resource: "client", action: "read" }]);
    prismaMock.client.findMany.mockResolvedValue([]);
    prismaMock.client.count.mockResolvedValue(11);

    const res = await request(app)
      .get(
        "/clients?page=2&limit=5&search=acme&type=CORPORATE&isActive=false&sortBy=name&sortOrder=asc"
      )
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toMatchObject({
      page: 2,
      limit: 5,
      total: 11,
      totalPages: 3,
    });

    const args = prismaMock.client.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 5, take: 5 });
    expect(args.where).toMatchObject({
      deletedAt: null,
      type: "CORPORATE",
      isActive: false,
    });
    expect(args.where.OR).toEqual(
      expect.arrayContaining([
        { clientCode: { contains: "acme", mode: "insensitive" } },
        { name: { contains: "acme", mode: "insensitive" } },
      ])
    );
    expect(args.orderBy).toEqual({ name: "asc" });
  });

  it("returns 400 for invalid filters", async () => {
    authenticate([{ resource: "client", action: "read" }]);

    const res = await request(app)
      .get("/clients?type=UNKNOWN&limit=1000")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.client.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks client:read", async () => {
    authenticate([{ resource: "client", action: "create" }]);

    const res = await request(app)
      .get("/clients")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.client.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /clients/:id", () => {
  it("returns a client without leaking deletedAt", async () => {
    authenticate([{ resource: "client", action: "read" }]);
    prismaMock.client.findFirst.mockResolvedValue(existingClient());
    prismaMock.client.findUnique.mockResolvedValue(
      existingClient({
        _count: {
          rateCardAssignments: 2,
          rentals: 1,
          riders: 3,
          invoices: 0,
        },
      })
    );

    const res = await request(app)
      .get(`/clients/${CLIENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.client.clientCode).toBe("CLI-ABC12345");
    expect(res.body.data.client._count.rateCardAssignments).toBe(2);
    expect(res.body.data.client).not.toHaveProperty("deletedAt");
  });

  it("returns 404 for a nonexistent client", async () => {
    authenticate([{ resource: "client", action: "read" }]);
    prismaMock.client.findFirst.mockResolvedValue(existingClient());
    prismaMock.client.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/clients/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 404 for a soft-deleted client", async () => {
    authenticate([{ resource: "client", action: "read" }]);
    prismaMock.client.findFirst.mockResolvedValue(
      existingClient({ deletedAt: new Date() })
    );
    prismaMock.client.findUnique.mockResolvedValue(
      existingClient({ deletedAt: new Date() })
    );

    const res = await request(app)
      .get(`/clients/${CLIENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid identifier", async () => {
    authenticate([{ resource: "client", action: "read" }]);

    const res = await request(app)
      .get("/clients/not-a-uuid")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.client.findFirst).not.toHaveBeenCalled();
  });
});

describe("PATCH /clients/:id", () => {
  it("updates allowed fields and writes before/after audit data", async () => {
    authenticate([{ resource: "client", action: "update" }]);
    const oldClient = existingClient();
    prismaMock.client.findFirst.mockResolvedValue(oldClient);
    prismaMock.client.findUnique.mockResolvedValue(oldClient);
    prismaMock.client.update.mockResolvedValue(
      existingClient({ contactPerson: "John Smith" })
    );

    const res = await request(app)
      .patch(`/clients/${CLIENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ contactPerson: "John Smith" });

    expect(res.status).toBe(200);
    expect(res.body.data.client.contactPerson).toBe("John Smith");
    expect(prismaMock.client.update).toHaveBeenCalledWith({
      where: { id: CLIENT_ID },
      data: { contactPerson: "John Smith" },
      select: expect.any(Object),
    });

    const audit = prismaMock.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      action: "UPDATE",
      resource: "Client",
      resourceId: CLIENT_ID,
    });
    expect(audit.changes.contactPerson).toEqual({
      old: "Jane Doe",
      new: "John Smith",
    });
  });

  it("rejects updates to the immutable clientCode and lifecycle field", async () => {
    authenticate([{ resource: "client", action: "update" }]);
    prismaMock.client.findFirst.mockResolvedValue(existingClient());

    const code = await request(app)
      .patch(`/clients/${CLIENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ clientCode: "CLI-CHANGED" });
    expect(code.status).toBe(400);
    expect(code.body.error.code).toBe("VALIDATION_ERROR");

    const active = await request(app)
      .patch(`/clients/${CLIENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: false });
    expect(active.status).toBe(400);
    expect(active.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("returns 404 when updating a nonexistent client", async () => {
    authenticate([{ resource: "client", action: "update" }]);
    prismaMock.client.findFirst.mockResolvedValue(existingClient());
    prismaMock.client.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/clients/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Nope" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks client:update", async () => {
    authenticate([{ resource: "client", action: "read" }]);

    const res = await request(app)
      .patch(`/clients/${CLIENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Nope" });

    expect(res.status).toBe(403);
    expect(prismaMock.client.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /clients/:id/status", () => {
  it("deactivates a client without deleting its history", async () => {
    authenticate([{ resource: "client", action: "status:update" }]);
    prismaMock.client.findFirst.mockResolvedValue(existingClient());
    prismaMock.client.findUnique.mockResolvedValue(existingClient());
    prismaMock.client.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .patch(`/clients/${CLIENT_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: false, reason: "Contract ended" });

    expect(res.status).toBe(200);
    expect(res.body.data.client.isActive).toBe(false);
    expect(prismaMock.client.updateMany).toHaveBeenCalledWith({
      where: { id: CLIENT_ID, isActive: true, deletedAt: null },
      data: { isActive: false },
    });
    expect(prismaMock.client.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATE",
        resource: "Client",
        resourceId: CLIENT_ID,
      }),
    });
  });

  it("rejects a redundant status change", async () => {
    authenticate([{ resource: "client", action: "status:update" }]);
    prismaMock.client.findFirst.mockResolvedValue(existingClient());
    prismaMock.client.findUnique.mockResolvedValue(existingClient());

    const res = await request(app)
      .patch(`/clients/${CLIENT_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: true });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.client.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 when the client does not exist", async () => {
    authenticate([{ resource: "client", action: "status:update" }]);
    prismaMock.client.findFirst.mockResolvedValue(existingClient());
    prismaMock.client.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/clients/${MISSING_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 when the role lacks client:status:update", async () => {
    authenticate([{ resource: "client", action: "update" }]);

    const res = await request(app)
      .patch(`/clients/${CLIENT_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(prismaMock.client.updateMany).not.toHaveBeenCalled();
  });
});

describe("GET /clients/:id/ratecards", () => {
  function assignmentRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e",
      clientId: CLIENT_ID,
      rateCardId: RATE_CARD_ID,
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
      validUntil: null,
      status: "ACTIVE",
      assignedAt: new Date("2026-01-01T00:00:00.000Z"),
      assignedById: "u1",
      unassignedAt: null,
      unassignedById: null,
      reason: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      client: { id: CLIENT_ID, clientCode: "CLI-ABC12345" },
      rateCard: {
        id: RATE_CARD_ID,
        code: "RC-ABC12345",
        name: "Standard B2B",
        vehicleCategory: "BIKE",
      },
      ...overrides,
    };
  }

  it("lists assigned ratecards with assignment metadata for the client", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "read" }]);
    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      deletedAt: null,
    });
    prismaMock.rateCardAssignment.findMany.mockResolvedValue([
      assignmentRow(),
    ]);
    prismaMock.rateCardAssignment.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/clients/${CLIENT_ID}/ratecards`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rateCards).toHaveLength(1);
    expect(res.body.data.rateCards[0]).toMatchObject({
      id: RATE_CARD_ID,
      code: "RC-ABC12345",
      assignment: { status: "ACTIVE", clientId: CLIENT_ID },
    });
    expect(
      prismaMock.rateCardAssignment.findMany.mock.calls[0][0].where
    ).toMatchObject({ clientId: CLIENT_ID });
  });

  it("returns an empty list when the client has no assignments", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "read" }]);
    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      deletedAt: null,
    });
    prismaMock.rateCardAssignment.findMany.mockResolvedValue([]);
    prismaMock.rateCardAssignment.count.mockResolvedValue(0);

    const res = await request(app)
      .get(`/clients/${CLIENT_ID}/ratecards`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rateCards).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it("returns 404 when the client does not exist", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "read" }]);
    prismaMock.client.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/clients/${MISSING_ID}/ratecards`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prismaMock.rateCardAssignment.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks ratecardAssignment:read", async () => {
    authenticate([{ resource: "ratecard", action: "read" }]);

    const res = await request(app)
      .get(`/clients/${CLIENT_ID}/ratecards`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.rateCardAssignment.findMany).not.toHaveBeenCalled();
  });
});
