import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const RENTAL_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const CLIENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const RIDER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";
const DUE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f";
const COLLECTION_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b02";

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

function rental(overrides: Record<string, unknown> = {}) {
  return {
    id: RENTAL_ID,
    rentalNumber: "RN-ABC12345",
    rentalType: "B2C",
    clientId: CLIENT_ID,
    riderId: RIDER_ID,
    status: "ACTIVE",
    currency: "INR",
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: null,
    collectionPeriod: "MONTHLY",
    dailyRate: "500.0000",
    weeklyRate: null,
    fortnightlyRate: null,
    monthlyRate: "12000.0000",
    ...overrides,
  };
}

function due(overrides: Record<string, unknown> = {}) {
  return {
    id: DUE_ID,
    rentalId: RENTAL_ID,
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-02-01T00:00:00.000Z"),
    dueDate: new Date("2026-01-01T00:00:00.000Z"),
    amountDue: "1000.00",
    amountCollected: "0.00",
    outstandingAmount: "1000.00",
    status: "PENDING",
    ...overrides,
  };
}

function collection(overrides: Record<string, unknown> = {}) {
  return {
    id: COLLECTION_ID,
    rentalId: RENTAL_ID,
    rentalDueId: DUE_ID,
    amount: "1000.00",
    currency: "INR",
    paymentMethod: "UPI",
    referenceNumber: "PAY-1",
    status: "CLEARED",
    receivedAt: new Date("2026-01-02T00:00:00.000Z"),
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
  prismaMock.rentalCollectionDue.findMany.mockResolvedValue([]);
  prismaMock.collection.findMany.mockResolvedValue([]);
  prismaMock.collection.count.mockResolvedValue(0);
  prismaMock.rentalLedgerEntry.upsert.mockResolvedValue({});
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("POST /collections", () => {
  it("records a CLEARED collection and allocates it to open dues", async () => {
    authenticate([{ resource: "collection", action: "create" }]);
    prismaMock.rental.findUnique.mockResolvedValue(rental());
    prismaMock.collection.findUnique.mockResolvedValue(null);
    prismaMock.rentalCollectionDue.findMany.mockResolvedValue([due()]);
    prismaMock.rentalCollectionDue.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.collection.create.mockResolvedValue(collection());

    const res = await request(app)
      .post("/collections")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        rentalId: RENTAL_ID,
        amount: "1000",
        paymentMethod: "UPI",
        referenceNumber: "PAY-1",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.collection.id).toBe(COLLECTION_ID);
    expect(res.body.data.allocations).toEqual([
      { dueId: DUE_ID, amount: expect.anything() },
    ]);
    expect(prismaMock.collection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rentalId: RENTAL_ID,
          status: "CLEARED",
          payerType: "RIDER",
          clientId: null,
          riderId: RIDER_ID,
          rentalDueId: DUE_ID,
        }),
      })
    );
    expect(prismaMock.rentalLedgerEntry.upsert).toHaveBeenCalled();
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "COLLECTION_RECEIVED",
        resource: "Collection",
      }),
    });
  });

  it("records a CLIENT-funded collection for a B2B rental", async () => {
    authenticate([{ resource: "collection", action: "create" }]);
    prismaMock.rental.findUnique.mockResolvedValue(
      rental({ rentalType: "B2B", riderId: null })
    );
    prismaMock.collection.findUnique.mockResolvedValue(null);
    prismaMock.collection.create.mockResolvedValue(collection());

    const res = await request(app)
      .post("/collections")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        rentalId: RENTAL_ID,
        amount: "1000",
        paymentMethod: "BANK_TRANSFER",
        status: "PENDING",
      });

    expect(res.status).toBe(201);
    expect(prismaMock.collection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payerType: "CLIENT",
          clientId: CLIENT_ID,
          riderId: null,
          status: "PENDING",
        }),
      })
    );
  });

  it("rejects an overpayment beyond the outstanding dues", async () => {
    authenticate([{ resource: "collection", action: "create" }]);
    prismaMock.rental.findUnique.mockResolvedValue(rental());
    prismaMock.collection.findUnique.mockResolvedValue(null);
    prismaMock.rentalCollectionDue.findMany.mockResolvedValue([
      due({ outstandingAmount: "100.00", amountDue: "100.00" }),
    ]);

    const res = await request(app)
      .post("/collections")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        rentalId: RENTAL_ID,
        amount: "500",
        paymentMethod: "CASH",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/exceeds/);
    expect(prismaMock.collection.create).not.toHaveBeenCalled();
  });

  it("rejects collections for a rental that is not ACTIVE or ON_HOLD", async () => {
    authenticate([{ resource: "collection", action: "create" }]);
    prismaMock.rental.findUnique.mockResolvedValue(rental({ status: "DRAFT" }));

    const res = await request(app)
      .post("/collections")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        rentalId: RENTAL_ID,
        amount: "100",
        paymentMethod: "CASH",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/ACTIVE or ON_HOLD/);
  });
});

describe("GET /collections", () => {
  it("lists collections with filters and pagination", async () => {
    authenticate([{ resource: "collection", action: "read" }]);
    prismaMock.collection.findMany.mockResolvedValue([collection()]);
    prismaMock.collection.count.mockResolvedValue(1);

    const res = await request(app)
      .get(
        `/collections?page=1&limit=10&rentalId=${RENTAL_ID}&status=CLEARED&paymentMethod=UPI&from=2026-01-01`
      )
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.collections).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
    const args = prismaMock.collection.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({
      rentalId: RENTAL_ID,
      status: "CLEARED",
      paymentMethod: "UPI",
    });
    expect(args.where.receivedAt.gte).toBeInstanceOf(Date);
  });
});

describe("GET /collections/:id", () => {
  it("returns a collection by id", async () => {
    authenticate([{ resource: "collection", action: "read" }]);
    prismaMock.collection.findFirst.mockResolvedValue(collection());
    prismaMock.collection.findUnique.mockResolvedValue(collection());

    const res = await request(app)
      .get(`/collections/${COLLECTION_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.collection.id).toBe(COLLECTION_ID);
  });

  it("returns 404 for an unknown collection", async () => {
    authenticate([{ resource: "collection", action: "read" }]);
    prismaMock.collection.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/collections/${MISSING_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /collections/:id/clear", () => {
  it("clears a pending collection and allocates it", async () => {
    authenticate([{ resource: "collection", action: "update" }]);
    prismaMock.collection.findFirst.mockResolvedValue(
      collection({ status: "PENDING" })
    );
    prismaMock.collection.findUnique.mockResolvedValue(
      collection({ status: "PENDING" })
    );
    prismaMock.rental.findUnique.mockResolvedValue(rental());
    prismaMock.rentalCollectionDue.findMany.mockResolvedValue([due()]);
    prismaMock.rentalCollectionDue.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.collection.update.mockResolvedValue(collection());

    const res = await request(app)
      .patch(`/collections/${COLLECTION_ID}/clear`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.collection.status).toBe("CLEARED");
    expect(prismaMock.collection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CLEARED" }),
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "COLLECTION_CLEARED",
        resource: "Collection",
      }),
    });
  });

  it("rejects clearing an already cleared collection", async () => {
    authenticate([{ resource: "collection", action: "update" }]);
    prismaMock.collection.findFirst.mockResolvedValue(collection());
    prismaMock.collection.findUnique.mockResolvedValue(collection());

    const res = await request(app)
      .patch(`/collections/${COLLECTION_ID}/clear`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already cleared/);
  });
});

describe("GET /rentals/:id/dues", () => {
  it("lists dues with the financial summary", async () => {
    authenticate([{ resource: "collection", action: "read" }]);
    prismaMock.rental.findUnique.mockResolvedValue(rental());
    prismaMock.rentalCollectionDue.findMany.mockResolvedValue([due()]);
    prismaMock.rentalCollectionDue.count.mockResolvedValue(1);
    prismaMock.rentalCollectionDue.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .get(`/rentals/${RENTAL_ID}/dues`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.dues).toHaveLength(1);
    expect(res.body.data.summary.totalCharges).toBe("1000");
    expect(res.body.data.pagination).toMatchObject({ total: 1 });
  });
});

describe("POST /rentals/:id/dues/generate", () => {
  it("generates one due per elapsed collection period", async () => {
    authenticate([{ resource: "collection", action: "due:generate" }]);
    prismaMock.rental.findUnique.mockResolvedValue(rental());
    prismaMock.rentalCollectionDue.findMany.mockResolvedValue([]);
    prismaMock.rentalCollectionDue.upsert
      .mockResolvedValueOnce({ id: "due-1" })
      .mockResolvedValueOnce({ id: "due-2" });
    prismaMock.rentalCollectionDue.updateMany.mockResolvedValue({ count: 0 });

    const res = await request(app)
      .post(`/rentals/${RENTAL_ID}/dues/generate`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ throughDate: "2026-02-15T00:00:00.000Z" });

    expect(res.status).toBe(201);
    expect(res.body.data.periodsProcessed).toBe(2);
    expect(res.body.data.generated).toBe(2);
    expect(prismaMock.rentalCollectionDue.upsert).toHaveBeenCalledTimes(2);
    const first = prismaMock.rentalCollectionDue.upsert.mock.calls[0][0];
    expect(first.create).toMatchObject({
      rentalId: RENTAL_ID,
      amountDue: expect.anything(),
      dueDate: new Date("2026-01-01T00:00:00.000Z"),
    });
  });
});

describe("GET /rentals/:id/collections", () => {
  it("lists collections for a rental with its summary", async () => {
    authenticate([{ resource: "collection", action: "read" }]);
    prismaMock.rental.findUnique.mockResolvedValue(rental());
    prismaMock.collection.findMany.mockResolvedValue([collection()]);
    prismaMock.collection.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/rentals/${RENTAL_ID}/collections`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rental.id).toBe(RENTAL_ID);
    expect(res.body.data.collections).toHaveLength(1);
    expect(res.body.data.pagination).toMatchObject({ total: 1 });
  });
});
