import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const RATE_CARD_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c";

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

function existingRateCard(overrides: Record<string, unknown> = {}) {
  return {
    id: RATE_CARD_ID,
    code: "RC-ABC12345",
    name: "Standard B2B",
    description: "Standard corporate pricing",
    vehicleCategory: "BIKE",
    rentalType: "B2B",
    billingFrequency: "MONTHLY",
    dailyRate: "500.0000",
    weeklyRate: "3000.0000",
    fortnightlyRate: null,
    monthlyRate: "10000.0000",
    securityDeposit: "5000.00",
    currency: "INR",
    effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    effectiveTo: new Date("2026-12-31T00:00:00.000Z"),
    isActive: true,
    terms: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.rateCard.findUnique.mockReset();
  prismaMock.rateCard.findFirst.mockReset();
  prismaMock.rateCard.findMany.mockReset();
  prismaMock.rateCard.count.mockReset();
  prismaMock.rateCard.create.mockReset();
  prismaMock.rateCard.update.mockReset();
  prismaMock.rateCard.updateMany.mockReset();
  prismaMock.rental.count.mockReset();
  prismaMock.auditLog.create.mockReset();
});

describe("POST /ratecards", () => {
  it("creates a reusable ratecard without a client", async () => {
    authenticate([{ resource: "ratecard", action: "create" }]);
    prismaMock.rateCard.create.mockResolvedValue(existingRateCard());

    const res = await request(app)
      .post("/ratecards")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        name: "Standard B2B",
        description: "Standard corporate pricing",
        vehicleCategory: "BIKE",
        rentalType: "B2B",
        billingFrequency: "MONTHLY",
        dailyRate: "500.0000",
        weeklyRate: "3000.0000",
        monthlyRate: "10000.0000",
        securityDeposit: "5000.00",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveTo: "2026-12-31T00:00:00.000Z",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: { rateCard: { id: RATE_CARD_ID, vehicleCategory: "BIKE" } },
    });
    expect(res.body.data.rateCard.clientId).toBeUndefined();
    expect(prismaMock.rateCard.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Standard B2B",
        vehicleCategory: "BIKE",
        rentalType: "B2B",
        billingFrequency: "MONTHLY",
        dailyRate: "500.0000",
        weeklyRate: "3000.0000",
        monthlyRate: "10000.0000",
        securityDeposit: "5000.00",
        currency: "INR",
        isActive: true,
      }),
      select: expect.any(Object),
    });
    expect(prismaMock.rateCard.create.mock.calls[0][0].data.clientId).toBeUndefined();
    expect(
      prismaMock.rateCard.create.mock.calls[0][0].data.code
    ).toMatch(/^RC-[A-F0-9]{8}$/);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "CREATE",
        resource: "RateCard",
        resourceId: RATE_CARD_ID,
      }),
    });
  });

  it("rejects a clientId because ratecards are not client-owned", async () => {
    authenticate([{ resource: "ratecard", action: "create" }]);

    const res = await request(app)
      .post("/ratecards")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        clientId: "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d",
        name: "Standard B2B",
        dailyRate: "500",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rateCard.create).not.toHaveBeenCalled();
  });

  it("rejects negative and zero daily rates before touching the database", async () => {
    authenticate([{ resource: "ratecard", action: "create" }]);

    for (const dailyRate of ["-1", "0"]) {
      const res = await request(app)
        .post("/ratecards")
        .set("Authorization", `Bearer ${accessToken()}`)
        .send({
          name: "Standard B2B",
          dailyRate,
          effectiveFrom: "2026-01-01T00:00:00.000Z",
        });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    }
    expect(prismaMock.rateCard.create).not.toHaveBeenCalled();
  });

  it("rejects negative optional monetary values", async () => {
    authenticate([{ resource: "ratecard", action: "create" }]);

    const res = await request(app)
      .post("/ratecards")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        name: "Standard B2B",
        dailyRate: "500",
        weeklyRate: "-100",
        securityDeposit: "-1",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rateCard.create).not.toHaveBeenCalled();
  });

  it("rejects an invalid validity period", async () => {
    authenticate([{ resource: "ratecard", action: "create" }]);

    const res = await request(app)
      .post("/ratecards")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        name: "Standard B2B",
        dailyRate: "500",
        effectiveFrom: "2026-12-31T00:00:00.000Z",
        effectiveTo: "2026-01-01T00:00:00.000Z",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rateCard.create).not.toHaveBeenCalled();
  });

  it("returns 409 for a duplicate code", async () => {
    authenticate([{ resource: "ratecard", action: "create" }]);
    prismaMock.rateCard.create.mockRejectedValue({ code: "P2002" });

    const res = await request(app)
      .post("/ratecards")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        code: "RC-ABC12345",
        name: "Duplicate",
        dailyRate: "500",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
  });

  it("returns 401 without authentication and 403 without ratecard:create", async () => {
    const unauthenticated = await request(app)
      .post("/ratecards")
      .send({ name: "X", dailyRate: "1" });
    expect(unauthenticated.status).toBe(401);

    authenticate([{ resource: "ratecard", action: "read" }]);
    const forbidden = await request(app)
      .post("/ratecards")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        name: "X",
        dailyRate: "1",
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      });
    expect(forbidden.status).toBe(403);
    expect(prismaMock.rateCard.create).not.toHaveBeenCalled();
  });
});

describe("GET /ratecards", () => {
  it("lists ratecards with a pagination envelope", async () => {
    authenticate([{ resource: "ratecard", action: "read" }]);
    prismaMock.rateCard.findMany.mockResolvedValue([existingRateCard()]);
    prismaMock.rateCard.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/ratecards")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rateCards).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("applies category, status, validity, search and sorting filters", async () => {
    authenticate([{ resource: "ratecard", action: "read" }]);
    prismaMock.rateCard.findMany.mockResolvedValue([]);
    prismaMock.rateCard.count.mockResolvedValue(3);

    const res = await request(app)
      .get(
        "/ratecards?page=1&limit=10&vehicleCategory=BIKE&isActive=true&rentalType=B2B&billingFrequency=MONTHLY&validOn=2026-06-01&search=standard&sortBy=effectiveFrom&sortOrder=asc"
      )
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    const args = prismaMock.rateCard.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 0, take: 10 });
    expect(args.where).toMatchObject({
      vehicleCategory: "BIKE",
      isActive: true,
      rentalType: "B2B",
      billingFrequency: "MONTHLY",
      effectiveFrom: { lte: new Date("2026-06-01") },
    });
    expect(args.where.OR).toEqual(
      expect.arrayContaining([
        { code: { contains: "standard", mode: "insensitive" } },
        { name: { contains: "standard", mode: "insensitive" } },
        { vehicleCategory: { contains: "standard", mode: "insensitive" } },
      ])
    );
    expect(args.orderBy).toEqual({ effectiveFrom: "asc" });
  });

  it("returns 400 for invalid filters", async () => {
    authenticate([{ resource: "ratecard", action: "read" }]);

    const res = await request(app)
      .get("/ratecards?isActive=maybe")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rateCard.findMany).not.toHaveBeenCalled();
  });

  it("returns 403 when the role lacks ratecard:read", async () => {
    authenticate([{ resource: "client", action: "read" }]);

    const res = await request(app)
      .get("/ratecards")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
    expect(prismaMock.rateCard.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /ratecards/:id", () => {
  it("returns a reusable ratecard with rental counts", async () => {
    authenticate([{ resource: "ratecard", action: "read" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(existingRateCard());
    prismaMock.rateCard.findUnique.mockResolvedValue(
      existingRateCard({
        _count: { rentals: 2 },
      })
    );

    const res = await request(app)
      .get(`/ratecards/${RATE_CARD_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rateCard.code).toBe("RC-ABC12345");
    expect(res.body.data.rateCard._count.rentals).toBe(2);
  });

  it("returns 404 for a nonexistent ratecard", async () => {
    authenticate([{ resource: "ratecard", action: "read" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(existingRateCard());
    prismaMock.rateCard.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/ratecards/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for an invalid identifier", async () => {
    authenticate([{ resource: "ratecard", action: "read" }]);

    const res = await request(app)
      .get("/ratecards/not-a-uuid")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rateCard.findFirst).not.toHaveBeenCalled();
  });
});

describe("PATCH /ratecards/:id", () => {
  it("updates metadata and commercial terms when no rentals reference it", async () => {
    authenticate([{ resource: "ratecard", action: "update" }]);
    const oldRateCard = existingRateCard();
    prismaMock.rateCard.findFirst.mockResolvedValue(oldRateCard);
    prismaMock.rateCard.findUnique.mockResolvedValue(oldRateCard);
    prismaMock.rental.count.mockResolvedValue(0);
    prismaMock.rateCard.update.mockResolvedValue(
      existingRateCard({ name: "Updated B2B", dailyRate: "550.0000" })
    );

    const res = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Updated B2B", dailyRate: "550.0000" });

    expect(res.status).toBe(200);
    expect(res.body.data.rateCard.name).toBe("Updated B2B");
    expect(prismaMock.rateCard.update).toHaveBeenCalledWith({
      where: { id: RATE_CARD_ID },
      data: { name: "Updated B2B", dailyRate: "550.0000" },
      select: expect.any(Object),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "UPDATE",
        resource: "RateCard",
        resourceId: RATE_CARD_ID,
      }),
    });
  });

  it("blocks commercial changes once rentals reference the ratecard", async () => {
    authenticate([{ resource: "ratecard", action: "update" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(existingRateCard());
    prismaMock.rateCard.findUnique.mockResolvedValue(existingRateCard());
    prismaMock.rental.count.mockResolvedValue(1);

    const res = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ dailyRate: "1.0000" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.rateCard.update).not.toHaveBeenCalled();
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it("still allows non-commercial metadata changes on a referenced ratecard", async () => {
    authenticate([{ resource: "ratecard", action: "update" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(existingRateCard());
    prismaMock.rateCard.findUnique.mockResolvedValue(existingRateCard());
    prismaMock.rental.count.mockResolvedValue(1);
    prismaMock.rateCard.update.mockResolvedValue(
      existingRateCard({ description: "Archived description" })
    );

    const res = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ description: "Archived description" });

    expect(res.status).toBe(200);
    expect(prismaMock.rental.count).not.toHaveBeenCalled();
    expect(prismaMock.rateCard.update).toHaveBeenCalled();
  });

  it("rejects a date range that becomes invalid after merging", async () => {
    authenticate([{ resource: "ratecard", action: "update" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(existingRateCard());
    prismaMock.rateCard.findUnique.mockResolvedValue(existingRateCard());

    const res = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ effectiveTo: "2025-01-01T00:00:00.000Z" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(prismaMock.rateCard.update).not.toHaveBeenCalled();
  });

  it("rejects immutable code and lifecycle updates", async () => {
    authenticate([{ resource: "ratecard", action: "update" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(existingRateCard());

    const code = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ code: "RC-CHANGED" });
    expect(code.status).toBe(400);

    const active = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: false });
    expect(active.status).toBe(400);
    expect(prismaMock.rateCard.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent ratecard", async () => {
    authenticate([{ resource: "ratecard", action: "update" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(existingRateCard());
    prismaMock.rateCard.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/ratecards/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Nope" });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 when the role lacks ratecard:update", async () => {
    authenticate([{ resource: "ratecard", action: "read" }]);

    const res = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ name: "Nope" });

    expect(res.status).toBe(403);
    expect(prismaMock.rateCard.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /ratecards/:id/status", () => {
  it("deactivates a ratecard without deleting it", async () => {
    authenticate([{ resource: "ratecard", action: "status:update" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(existingRateCard());
    prismaMock.rateCard.findUnique.mockResolvedValue(existingRateCard());
    prismaMock.rateCard.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: false, reason: "Superseded" });

    expect(res.status).toBe(200);
    expect(res.body.data.rateCard.isActive).toBe(false);
    expect(prismaMock.rateCard.updateMany).toHaveBeenCalledWith({
      where: { id: RATE_CARD_ID, isActive: true },
      data: { isActive: false },
    });
    expect(prismaMock.rateCard.update).not.toHaveBeenCalled();
  });

  it("reactivates without requiring a client", async () => {
    authenticate([{ resource: "ratecard", action: "status:update" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(
      existingRateCard({ isActive: false })
    );
    prismaMock.rateCard.findUnique.mockResolvedValue(
      existingRateCard({ isActive: false })
    );
    prismaMock.rateCard.updateMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(prismaMock.rateCard.updateMany).toHaveBeenCalled();
    expect(prismaMock.client.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a redundant status change", async () => {
    authenticate([{ resource: "ratecard", action: "status:update" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(existingRateCard());
    prismaMock.rateCard.findUnique.mockResolvedValue(existingRateCard());

    const res = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: true });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CONFLICT");
    expect(prismaMock.rateCard.updateMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent ratecard", async () => {
    authenticate([{ resource: "ratecard", action: "status:update" }]);
    prismaMock.rateCard.findFirst.mockResolvedValue(existingRateCard());
    prismaMock.rateCard.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/ratecards/${MISSING_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 403 when the role lacks ratecard:status:update", async () => {
    authenticate([{ resource: "ratecard", action: "update" }]);

    const res = await request(app)
      .patch(`/ratecards/${RATE_CARD_ID}/status`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ isActive: false });

    expect(res.status).toBe(403);
    expect(prismaMock.rateCard.updateMany).not.toHaveBeenCalled();
  });
});
