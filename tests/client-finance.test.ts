import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const CLIENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const RENTAL_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const RENTAL_ID_2 = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01";
const DUE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f";
const COLLECTION_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b02";

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

function client(overrides: Record<string, unknown> = {}) {
  return {
    id: CLIENT_ID,
    clientCode: "CL-001",
    name: "Acme Logistics",
    type: "CORPORATE",
    isActive: true,
    deletedAt: null,
    ...overrides,
  };
}

function rental(overrides: Record<string, unknown> = {}) {
  return {
    id: RENTAL_ID,
    rentalNumber: "RN-1",
    status: "ACTIVE",
    collectionPeriod: "MONTHLY",
    currency: "INR",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: null,
    ...overrides,
  };
}

function due(overrides: Record<string, unknown> = {}) {
  return {
    id: DUE_ID,
    rentalId: RENTAL_ID,
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-01-31T00:00:00.000Z"),
    dueDate: new Date("2026-01-01T00:00:00.000Z"),
    amountDue: "100.00",
    amountCollected: "0.00",
    outstandingAmount: "100.00",
    status: "OVERDUE",
    generatedAt: new Date("2026-01-01T00:00:00.000Z"),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    rental: { id: RENTAL_ID, rentalNumber: "RN-1", status: "ACTIVE" },
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
  prismaMock.rental.findMany.mockResolvedValue([]);
  prismaMock.rentalCollectionDue.findMany.mockResolvedValue([]);
  prismaMock.rentalCollectionDue.count.mockResolvedValue(0);
  prismaMock.collection.findMany.mockResolvedValue([]);
  prismaMock.collection.count.mockResolvedValue(0);
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("GET /clients/:id/financials", () => {
  it("aggregates dues and collections across the client's B2B rentals", async () => {
    authenticate([{ resource: "collection", action: "client:read" }]);
    prismaMock.client.findUnique.mockResolvedValue(client());
    prismaMock.rental.findMany.mockResolvedValue([
      rental(),
      rental({
        id: RENTAL_ID_2,
        rentalNumber: "RN-2",
        status: "COMPLETED",
      }),
    ]);
    prismaMock.rentalCollectionDue.findMany.mockResolvedValue([
      due(),
      due({
        id: "due-2",
        rentalId: RENTAL_ID_2,
        amountDue: "500.00",
        amountCollected: "500.00",
        outstandingAmount: "0.00",
        status: "PAID",
      }),
    ]);
    prismaMock.collection.findMany.mockResolvedValue([
      { amount: "0.00", rentalId: RENTAL_ID },
      { amount: "500.00", rentalId: RENTAL_ID_2 },
    ]);

    const res = await request(app)
      .get(`/clients/${CLIENT_ID}/financials`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({
      totalCharges: "600",
      totalCollectedOnDues: "500",
      confirmedCollections: "500",
      outstanding: "100",
      overdueOutstanding: "100",
      rentalCount: 2,
      activeRentalCount: 1,
    });
    expect(res.body.data.rentals).toHaveLength(2);
  });

  it("returns an empty summary for a non-corporate client", async () => {
    authenticate([{ resource: "collection", action: "client:read" }]);
    prismaMock.client.findUnique.mockResolvedValue(
      client({ type: "INDIVIDUAL" })
    );

    const res = await request(app)
      .get(`/clients/${CLIENT_ID}/financials`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.rentalCount).toBe(0);
  });
});

describe("GET /clients/:id/dues", () => {
  it("lists client dues scoped to B2B rentals", async () => {
    authenticate([{ resource: "collection", action: "client:read" }]);
    prismaMock.client.findUnique.mockResolvedValue(client());
    prismaMock.rentalCollectionDue.findMany.mockResolvedValue([due()]);
    prismaMock.rentalCollectionDue.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/clients/${CLIENT_ID}/dues`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(1);
    expect(prismaMock.rentalCollectionDue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          rental: { clientId: CLIENT_ID, rentalType: "B2B" },
        }),
      })
    );
  });
});

describe("POST /clients/:id/dues/generate", () => {
  it("generates dues across all eligible B2B rentals", async () => {
    authenticate([{ resource: "collection", action: "client:due:generate" }]);
    prismaMock.client.findUnique.mockResolvedValue(client());
    prismaMock.rental.findMany.mockResolvedValue([
      { id: RENTAL_ID, rentalNumber: "RN-1", status: "ACTIVE" },
    ]);
    prismaMock.rental.findUnique.mockResolvedValue({
      ...rental(),
      dailyRate: "500.0000",
      weeklyRate: null,
      fortnightlyRate: null,
      monthlyRate: "12000.0000",
    });
    prismaMock.rentalCollectionDue.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([due()]);
    prismaMock.rentalCollectionDue.upsert.mockResolvedValue({ id: DUE_ID });
    prismaMock.ledgerEntry.upsert.mockResolvedValue({});
    prismaMock.rentalCollectionDue.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post(`/clients/${CLIENT_ID}/dues/generate`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ throughDate: "2026-01-31T00:00:00.000Z" });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      rentalsProcessed: 1,
      generated: 1,
    });
    expect(res.body.data.results[0]).toMatchObject({
      rentalId: RENTAL_ID,
      generated: 1,
    });
  });
});

describe("POST /clients/:id/payments", () => {
  function mockPayment(overrides: { amount?: string } = {}) {
    prismaMock.client.findUnique.mockResolvedValue(client());
    prismaMock.collection.findFirst.mockResolvedValue(null);
    prismaMock.rental.findUnique.mockResolvedValue({
      ...rental(),
      clientId: CLIENT_ID,
      rentalType: "B2B",
    });
    prismaMock.rental.findMany.mockResolvedValue([rental()]);
    prismaMock.rentalCollectionDue.findMany.mockResolvedValue([due()]);
    prismaMock.rentalCollectionDue.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.collection.create.mockResolvedValue({
      id: COLLECTION_ID,
      rentalId: RENTAL_ID,
      amount: overrides.amount ?? "100.00",
      status: "CLEARED",
    });
    prismaMock.collection.findMany.mockResolvedValue([
      { amount: overrides.amount ?? "100.00", rentalId: RENTAL_ID },
    ]);
    prismaMock.ledgerEntry.upsert.mockResolvedValue({});
  }

  it("allocates a consolidated client payment to the rental's oldest dues", async () => {
    authenticate([{ resource: "collection", action: "client:pay" }]);
    mockPayment();

    const res = await request(app)
      .post(`/clients/${CLIENT_ID}/payments`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        amount: "100",
        paymentMethod: "BANK_TRANSFER",
        referenceNumber: "NEFT-1",
        rentalId: RENTAL_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.allocations).toHaveLength(1);
    expect(res.body.data.allocations[0]).toMatchObject({
      rentalId: RENTAL_ID,
      amount: "100",
    });
    expect(prismaMock.collection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payerType: "CLIENT",
          clientId: CLIENT_ID,
          rentalId: RENTAL_ID,
          status: "CLEARED",
        }),
      })
    );
    expect(prismaMock.ledgerEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          entryType: "COLLECTION_RECEIVED",
          direction: "CREDIT",
        }),
      })
    );
  });

  it("rejects a payment that exceeds the outstanding balance", async () => {
    authenticate([{ resource: "collection", action: "client:pay" }]);
    mockPayment({ amount: "200.00" });

    const res = await request(app)
      .post(`/clients/${CLIENT_ID}/payments`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        amount: "200",
        paymentMethod: "BANK_TRANSFER",
        rentalId: RENTAL_ID,
      });

    expect(res.status).toBe(409);
    expect(prismaMock.collection.create).not.toHaveBeenCalled();
  });

  it("rejects consolidated payments for a non-corporate client", async () => {
    authenticate([{ resource: "collection", action: "client:pay" }]);
    prismaMock.client.findUnique.mockResolvedValue(
      client({ type: "INDIVIDUAL" })
    );

    const res = await request(app)
      .post(`/clients/${CLIENT_ID}/payments`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ amount: "100", paymentMethod: "CASH" });

    expect(res.status).toBe(409);
    expect(prismaMock.rental.findMany).not.toHaveBeenCalled();
  });
});
