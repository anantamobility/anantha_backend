import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const ASSIGNMENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const RATE_CARD_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c";
const CLIENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";

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
    isActive: true,
    deletedAt: null,
    ...overrides,
  };
}

function existingRateCard(overrides: Record<string, unknown> = {}) {
  return {
    id: RATE_CARD_ID,
    code: "RC-ABC12345",
    name: "Standard B2B",
    vehicleCategory: "BIKE",
    isActive: true,
    ...overrides,
  };
}

function existingAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSIGNMENT_ID,
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
    client: existingClient(),
    rateCard: existingRateCard(),
    _count: { rentals: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.client.findUnique.mockReset();
  prismaMock.rateCard.findUnique.mockReset();
  prismaMock.rateCardAssignment.findUnique.mockReset();
  prismaMock.rateCardAssignment.findUniqueOrThrow.mockReset();
  prismaMock.rateCardAssignment.findFirst.mockReset();
  prismaMock.rateCardAssignment.findMany.mockReset();
  prismaMock.rateCardAssignment.count.mockReset();
  prismaMock.rateCardAssignment.create.mockReset();
  prismaMock.rateCardAssignment.update.mockReset();
  prismaMock.rateCardAssignment.updateMany.mockReset();
  prismaMock.rental.count.mockReset();
  prismaMock.auditLog.create.mockReset();
});

describe("POST /ratecard-assignments", () => {
  it("assigns a reusable ratecard to a client", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "create" }]);
    prismaMock.client.findUnique.mockResolvedValue(existingClient());
    prismaMock.rateCard.findUnique.mockResolvedValue(existingRateCard());
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue(null);
    prismaMock.rateCardAssignment.create.mockResolvedValue(
      existingAssignment()
    );

    const res = await request(app)
      .post("/ratecard-assignments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        clientId: CLIENT_ID,
        rateCardId: RATE_CARD_ID,
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: "2026-12-31T00:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.assignment).toMatchObject({
      id: ASSIGNMENT_ID,
      clientId: CLIENT_ID,
      rateCardId: RATE_CARD_ID,
      status: "ACTIVE",
    });
    expect(prismaMock.rateCardAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: CLIENT_ID,
        rateCardId: RATE_CARD_ID,
        status: "ACTIVE",
        assignedById: "u1",
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
        validUntil: new Date("2026-12-31T00:00:00.000Z"),
      }),
      select: expect.any(Object),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        resource: "RateCardAssignment",
        resourceId: ASSIGNMENT_ID,
      }),
    });
  });

  it("allows multiple different ratecards for the same client", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "create" }]);
    prismaMock.client.findUnique.mockResolvedValue(existingClient());
    prismaMock.rateCard.findUnique.mockResolvedValue(
      existingRateCard({
        id: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f",
        code: "RC-SECOND",
      })
    );
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue(null);
    prismaMock.rateCardAssignment.create.mockResolvedValue(
      existingAssignment({ rateCardId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f" })
    );

    const res = await request(app)
      .post("/ratecard-assignments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        clientId: CLIENT_ID,
        rateCardId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f",
      });

    expect(res.status).toBe(201);
    expect(prismaMock.rateCardAssignment.findFirst).toHaveBeenCalledWith({
      where: {
        clientId: CLIENT_ID,
        rateCardId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f",
        status: "ACTIVE",
      },
      select: { id: true },
    });
  });

  it("rejects a duplicate active assignment of the same ratecard", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "create" }]);
    prismaMock.client.findUnique.mockResolvedValue(existingClient());
    prismaMock.rateCard.findUnique.mockResolvedValue(existingRateCard());
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue({
      id: ASSIGNMENT_ID,
    });

    const res = await request(app)
      .post("/ratecard-assignments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ clientId: CLIENT_ID, rateCardId: RATE_CARD_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.rateCardAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects an active assignment to an inactive client", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "create" }]);
    prismaMock.client.findUnique.mockResolvedValue(
      existingClient({ isActive: false })
    );
    prismaMock.rateCard.findUnique.mockResolvedValue(existingRateCard());

    const res = await request(app)
      .post("/ratecard-assignments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ clientId: CLIENT_ID, rateCardId: RATE_CARD_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.rateCardAssignment.create).not.toHaveBeenCalled();
  });

  it("rejects an active assignment using an inactive ratecard", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "create" }]);
    prismaMock.client.findUnique.mockResolvedValue(existingClient());
    prismaMock.rateCard.findUnique.mockResolvedValue(
      existingRateCard({ isActive: false })
    );

    const res = await request(app)
      .post("/ratecard-assignments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ clientId: CLIENT_ID, rateCardId: RATE_CARD_ID });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.rateCardAssignment.create).not.toHaveBeenCalled();
  });

  it("validates date ranges, UUIDs and unknown fields", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "create" }]);

    const badDate = await request(app)
      .post("/ratecard-assignments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        clientId: CLIENT_ID,
        rateCardId: RATE_CARD_ID,
        validFrom: "2026-12-31T00:00:00.000Z",
        validUntil: "2026-01-01T00:00:00.000Z",
      });
    expect(badDate.status).toBe(400);
    expect(badDate.body.error.code).toBe("VALIDATION_ERROR");

    const badId = await request(app)
      .post("/ratecard-assignments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ clientId: "nope", rateCardId: RATE_CARD_ID });
    expect(badId.status).toBe(400);

    const unknown = await request(app)
      .post("/ratecard-assignments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        clientId: CLIENT_ID,
        rateCardId: RATE_CARD_ID,
        ratecardId: RATE_CARD_ID,
      });
    expect(unknown.status).toBe(400);
    expect(prismaMock.rateCardAssignment.create).not.toHaveBeenCalled();
  });

  it("returns 401 without authentication and 403 without permission", async () => {
    const unauthenticated = await request(app)
      .post("/ratecard-assignments")
      .send({ clientId: CLIENT_ID, rateCardId: RATE_CARD_ID });
    expect(unauthenticated.status).toBe(401);

    authenticate([{ resource: "ratecardAssignment", action: "read" }]);
    const forbidden = await request(app)
      .post("/ratecard-assignments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ clientId: CLIENT_ID, rateCardId: RATE_CARD_ID });
    expect(forbidden.status).toBe(403);
    expect(prismaMock.rateCardAssignment.create).not.toHaveBeenCalled();
  });
});

describe("GET /ratecard-assignments", () => {
  it("lists assignments with filters and pagination", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "read" }]);
    prismaMock.rateCardAssignment.findMany.mockResolvedValue([
      existingAssignment(),
    ]);
    prismaMock.rateCardAssignment.count.mockResolvedValue(1);

    const res = await request(app)
      .get(
        `/ratecard-assignments?clientId=${CLIENT_ID}&rateCardId=${RATE_CARD_ID}&status=ACTIVE&validOn=2026-06-01&page=1&limit=5`
      )
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.assignments).toHaveLength(1);
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      limit: 5,
      total: 1,
    });
    const args = prismaMock.rateCardAssignment.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      clientId: CLIENT_ID,
      rateCardId: RATE_CARD_ID,
      status: "ACTIVE",
      validFrom: { lte: new Date("2026-06-01") },
    });
  });

  it("returns 400 for invalid filters", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "read" }]);

    const res = await request(app)
      .get("/ratecard-assignments?status=EXPIRED&clientId=bad")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rateCardAssignment.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 without ratecardAssignment:read", async () => {
    authenticate([{ resource: "ratecard", action: "read" }]);

    const res = await request(app)
      .get("/ratecard-assignments")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.rateCardAssignment.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /ratecard-assignments/:id", () => {
  it("returns one assignment with client and ratecard data", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "read" }]);
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue(
      existingAssignment()
    );
    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(
      existingAssignment()
    );

    const res = await request(app)
      .get(`/ratecard-assignments/${ASSIGNMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.assignment.client.clientCode).toBe("CLI-ABC12345");
    expect(res.body.data.assignment.rateCard.code).toBe("RC-ABC12345");
  });

  it("returns 404 when the assignment does not exist", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "read" }]);
    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/ratecard-assignments/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});

describe("GET /ratecards/:id/clients", () => {
  it("lists clients assigned to a ratecard with assignment metadata", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "read" }]);
    prismaMock.rateCard.findUnique.mockResolvedValue({ id: RATE_CARD_ID });
    prismaMock.rateCardAssignment.findMany.mockResolvedValue([
      existingAssignment(),
    ]);
    prismaMock.rateCardAssignment.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/ratecards/${RATE_CARD_ID}/clients?search=acme`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.clients).toHaveLength(1);
    expect(res.body.data.clients[0]).toMatchObject({
      id: CLIENT_ID,
      clientCode: "CLI-ABC12345",
      assignment: { rateCardId: RATE_CARD_ID, status: "ACTIVE" },
    });
    const args = prismaMock.rateCardAssignment.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ rateCardId: RATE_CARD_ID });
    expect(args.where.client.OR).toEqual(
      expect.arrayContaining([
        { clientCode: { contains: "acme", mode: "insensitive" } },
        { name: { contains: "acme", mode: "insensitive" } },
      ])
    );
  });

  it("returns 404 when the ratecard does not exist", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "read" }]);
    prismaMock.rateCard.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/ratecards/${MISSING_ID}/clients`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(prismaMock.rateCardAssignment.findMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /ratecard-assignments/:id", () => {
  it("updates assignment validity and status", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "update" }]);
    prismaMock.rateCardAssignment.findFirst
      .mockResolvedValueOnce(existingAssignment())
      .mockResolvedValueOnce(null);
    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(
      existingAssignment()
    );
    prismaMock.rateCardAssignment.update.mockResolvedValue(
      existingAssignment({ validUntil: new Date("2027-06-30T00:00:00.000Z") })
    );

    const res = await request(app)
      .patch(`/ratecard-assignments/${ASSIGNMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        validUntil: "2027-06-30T00:00:00.000Z",
        status: "ACTIVE",
      });

    expect(res.status).toBe(200);
    expect(prismaMock.rateCardAssignment.update).toHaveBeenCalledWith({
      where: { id: ASSIGNMENT_ID },
      data: {
        validUntil: new Date("2027-06-30T00:00:00.000Z"),
        status: "ACTIVE",
      },
      select: expect.any(Object),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATE",
        resource: "RateCardAssignment",
        resourceId: ASSIGNMENT_ID,
      }),
    });
  });

  it("validates the assignment to active before reactivation", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "update" }]);
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue(
      existingAssignment({ status: "INACTIVE" })
    );
    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(
      existingAssignment({ status: "INACTIVE" })
    );
    prismaMock.client.findUnique.mockResolvedValue(
      existingClient({ isActive: false })
    );
    prismaMock.rateCard.findUnique.mockResolvedValue(existingRateCard());

    const res = await request(app)
      .patch(`/ratecard-assignments/${ASSIGNMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "ACTIVE" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.rateCardAssignment.update).not.toHaveBeenCalled();
  });

  it("rejects invalid dates and changes to cancelled assignments", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "update" }]);
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue(
      existingAssignment()
    );
    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(
      existingAssignment()
    );

    const badDate = await request(app)
      .patch(`/ratecard-assignments/${ASSIGNMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ validUntil: "2025-01-01T00:00:00.000Z" });
    expect(badDate.status).toBe(400);
    expect(badDate.body.error.code).toBe("VALIDATION_ERROR");

    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(
      existingAssignment({ status: "CANCELLED" })
    );
    const cancelled = await request(app)
      .patch(`/ratecard-assignments/${ASSIGNMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "INACTIVE" });
    expect(cancelled.status).toBe(409);
    expect(prismaMock.rateCardAssignment.update).not.toHaveBeenCalled();
  });

  it("returns 404 and 403 cases", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "update" }]);
    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(null);

    const missing = await request(app)
      .patch(`/ratecard-assignments/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "INACTIVE" });
    expect(missing.status).toBe(404);

    authenticate([{ resource: "ratecardAssignment", action: "read" }]);
    const forbidden = await request(app)
      .patch(`/ratecard-assignments/${ASSIGNMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ status: "INACTIVE" });
    expect(forbidden.status).toBe(403);
    expect(prismaMock.rateCardAssignment.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /ratecard-assignments/:id", () => {
  it("unassigns safely by cancelling and preserving the row", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "delete" }]);
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue(
      existingAssignment()
    );
    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(
      existingAssignment()
    );
    prismaMock.rental.count.mockResolvedValue(0);
    prismaMock.rateCardAssignment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.rateCardAssignment.findUniqueOrThrow.mockResolvedValue(
      existingAssignment({
        status: "CANCELLED",
        unassignedAt: new Date("2026-06-01T00:00:00.000Z"),
        unassignedById: "u1",
      })
    );

    const res = await request(app)
      .delete(`/ratecard-assignments/${ASSIGNMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ reason: "Contract ended" });

    expect(res.status).toBe(200);
    expect(res.body.data.assignment.status).toBe("CANCELLED");
    expect(prismaMock.rateCardAssignment.updateMany).toHaveBeenCalledWith({
      where: { id: ASSIGNMENT_ID, status: "ACTIVE" },
      data: expect.objectContaining({
        status: "CANCELLED",
        unassignedById: "u1",
        reason: "Contract ended",
      }),
    });
    expect(prismaMock.rateCardAssignment.delete).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UNASSIGN",
        resource: "RateCardAssignment",
      }),
    });
  });

  it("blocks unassignment while active rentals use the assignment", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "delete" }]);
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue(
      existingAssignment()
    );
    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(
      existingAssignment()
    );
    prismaMock.rental.count.mockResolvedValue(1);

    const res = await request(app)
      .delete(`/ratecard-assignments/${ASSIGNMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.rateCardAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a repeated unassignment", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "delete" }]);
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue(
      existingAssignment({ status: "CANCELLED" })
    );
    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(
      existingAssignment({ status: "CANCELLED" })
    );

    const res = await request(app)
      .delete(`/ratecard-assignments/${ASSIGNMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.rateCardAssignment.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 and 403 cases", async () => {
    authenticate([{ resource: "ratecardAssignment", action: "delete" }]);
    prismaMock.rateCardAssignment.findUnique.mockResolvedValue(null);

    const missing = await request(app)
      .delete(`/ratecard-assignments/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);
    expect(missing.status).toBe(404);

    authenticate([{ resource: "ratecardAssignment", action: "update" }]);
    const forbidden = await request(app)
      .delete(`/ratecard-assignments/${ASSIGNMENT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);
    expect(forbidden.status).toBe(403);
    expect(prismaMock.rateCardAssignment.updateMany).not.toHaveBeenCalled();
  });
});
