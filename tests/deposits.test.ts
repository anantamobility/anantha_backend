import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const RENTAL_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const DEPOSIT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const MISSING_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";
const TRANSACTION_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f";

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

function deposit(overrides: Record<string, unknown> = {}) {
  return {
    id: DEPOSIT_ID,
    payerType: "RIDER",
    clientId: null,
    riderId: null,
    rentalId: RENTAL_ID,
    amountRequired: "2000.00",
    currency: "INR",
    status: "RECEIVED",
    dueDate: new Date("2026-01-01T00:00:00.000Z"),
    version: 0,
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
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
  prismaMock.depositTransaction.findMany.mockResolvedValue([]);
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("GET /rentals/:id/deposit", () => {
  it("returns the deposit with its derived balance", async () => {
    authenticate([{ resource: "deposit", action: "read" }]);
    prismaMock.deposit.findUnique.mockResolvedValue(deposit());
    prismaMock.depositTransaction.findMany.mockResolvedValue([
      { direction: "CREDIT", amount: "2000.00" },
      { direction: "DEBIT", amount: "500.00" },
    ]);

    const res = await request(app)
      .get(`/rentals/${RENTAL_ID}/deposit`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.deposit.id).toBe(DEPOSIT_ID);
    expect(res.body.data.balance).toBe("1500");
    expect(res.body.data.totalCredits).toBe("2000");
    expect(res.body.data.totalDebits).toBe("500");
  });

  it("returns 404 when the rental has no deposit", async () => {
    authenticate([{ resource: "deposit", action: "read" }]);
    prismaMock.deposit.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get(`/rentals/${MISSING_ID}/deposit`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
  });
});

describe("GET /rentals/:id/deposit/ledger", () => {
  it("returns paginated deposit transactions and totals", async () => {
    authenticate([{ resource: "deposit", action: "read" }]);
    prismaMock.deposit.findUnique.mockResolvedValue({
      id: DEPOSIT_ID,
      currency: "INR",
    });
    prismaMock.depositTransaction.findMany.mockResolvedValue([
      { id: TRANSACTION_ID, type: "RECEIPT", direction: "CREDIT" },
    ]);
    prismaMock.depositTransaction.count.mockResolvedValue(1);

    const res = await request(app)
      .get(`/rentals/${RENTAL_ID}/deposit/ledger?page=1&limit=10`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.transactions).toHaveLength(1);
    expect(res.body.data.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });
});

describe("POST /rentals/:id/deposit/receive", () => {
  it("records a receipt and updates the deposit status", async () => {
    authenticate([{ resource: "deposit", action: "receive" }]);
    prismaMock.deposit.findUnique.mockResolvedValue(deposit({ status: "REQUIRED" }));
    prismaMock.depositTransaction.findUnique.mockResolvedValue(null);
    prismaMock.deposit.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.depositTransaction.create.mockResolvedValue({
      id: TRANSACTION_ID,
      type: "RECEIPT",
      direction: "CREDIT",
      amount: "500.00",
    });
    prismaMock.deposit.update.mockResolvedValue(
      deposit({ status: "PARTIALLY_RECEIVED" })
    );

    const res = await request(app)
      .post(`/rentals/${RENTAL_ID}/deposit/receive`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ amount: "500", reference: "RCPT-1" });

    expect(res.status).toBe(201);
    expect(res.body.data.transaction.id).toBe(TRANSACTION_ID);
    expect(res.body.data.balance).toBe("500");
    expect(prismaMock.depositTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        depositId: DEPOSIT_ID,
        type: "RECEIPT",
        direction: "CREDIT",
        reference: "RCPT-1",
      }),
    });
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DEPOSIT_RECEIPT",
        resource: "Deposit",
      }),
    });
  });

  it("returns 400 for a non-positive amount", async () => {
    authenticate([{ resource: "deposit", action: "receive" }]);

    const res = await request(app)
      .post(`/rentals/${RENTAL_ID}/deposit/receive`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ amount: "0" });

    expect(res.status).toBe(400);
    expect(prismaMock.depositTransaction.create).not.toHaveBeenCalled();
  });
});

describe("POST /rentals/:id/deposit/refund", () => {
  it("rejects a refund that exceeds the available balance", async () => {
    authenticate([{ resource: "deposit", action: "refund" }]);
    prismaMock.deposit.findUnique.mockResolvedValue(deposit());
    prismaMock.depositTransaction.findUnique.mockResolvedValue(null);
    prismaMock.deposit.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.depositTransaction.findMany.mockResolvedValue([
      { direction: "CREDIT", amount: "100.00" },
    ]);

    const res = await request(app)
      .post(`/rentals/${RENTAL_ID}/deposit/refund`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ amount: "500" });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/insufficient/);
    expect(prismaMock.depositTransaction.create).not.toHaveBeenCalled();
  });

  it("records a refund when the balance is sufficient", async () => {
    authenticate([{ resource: "deposit", action: "refund" }]);
    prismaMock.deposit.findUnique.mockResolvedValue(deposit());
    prismaMock.depositTransaction.findUnique.mockResolvedValue(null);
    prismaMock.deposit.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.depositTransaction.findMany.mockResolvedValue([
      { direction: "CREDIT", amount: "2000.00" },
    ]);
    prismaMock.depositTransaction.create.mockResolvedValue({
      id: TRANSACTION_ID,
      type: "REFUND",
      direction: "DEBIT",
    });
    prismaMock.deposit.update.mockResolvedValue(
      deposit({ status: "PARTIALLY_REFUNDED" })
    );

    const res = await request(app)
      .post(`/rentals/${RENTAL_ID}/deposit/refund`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ amount: "500" });

    expect(res.status).toBe(201);
    expect(res.body.data.balance).toBe("1500");
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "DEPOSIT_REFUND",
        resource: "Deposit",
      }),
    });
  });
});

describe("POST /rentals/:id/deposit/adjust", () => {
  it("requires a reason", async () => {
    authenticate([{ resource: "deposit", action: "adjust" }]);

    const res = await request(app)
      .post(`/rentals/${RENTAL_ID}/deposit/adjust`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ amount: "100", direction: "CREDIT" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a debit adjustment above the balance", async () => {
    authenticate([{ resource: "deposit", action: "adjust" }]);
    prismaMock.deposit.findUnique.mockResolvedValue(deposit());
    prismaMock.depositTransaction.findUnique.mockResolvedValue(null);
    prismaMock.deposit.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.depositTransaction.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post(`/rentals/${RENTAL_ID}/deposit/adjust`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ amount: "100", direction: "DEBIT", reason: "Damage" });

    expect(res.status).toBe(409);
    expect(prismaMock.depositTransaction.create).not.toHaveBeenCalled();
  });
});
