import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const RIDER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";
const RENTAL_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const DUE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a9f";
const STATEMENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01";
const COLLECTION_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b02";
const PAYOUT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b03";

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

function rider(overrides: Record<string, unknown> = {}) {
  return {
    id: RIDER_ID,
    riderCode: "RDR-001",
    fullName: "Test Rider",
    status: "ACTIVE",
    rentalType: "B2C",
    deletedAt: null,
    ...overrides,
  };
}

function statementDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: STATEMENT_ID,
    statementNumber: "STL-ABC123",
    riderId: RIDER_ID,
    periodStart: new Date("2026-01-01T00:00:00.000Z"),
    periodEnd: new Date("2026-01-02T00:00:00.000Z"),
    status: "PAYABLE",
    currency: "INR",
    grossEarnings: "1000.00",
    totalDeductions: "300.00",
    netPayable: "700.00",
    shortfallAmount: "0.00",
    requiresManualReview: false,
    version: 1,
    approvedById: null,
    approvedAt: null,
    paidAt: null,
    failureReason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    rider: { id: RIDER_ID, riderCode: "RDR-001", fullName: "Test Rider" },
    approvedBy: null,
    lines: [],
    payouts: [],
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
  prismaMock.riderPayStatement.findMany.mockResolvedValue([]);
  prismaMock.riderPayStatement.count.mockResolvedValue(0);
  prismaMock.ledgerEntry.findMany.mockResolvedValue([]);
  prismaMock.rentalCollectionDue.findMany.mockResolvedValue([]);
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("POST /pay-statements/generate", () => {
  function mockGeneration(overrides: {
    earnings?: unknown[];
    debits?: unknown[];
    dues?: unknown[];
  } = {}) {
    prismaMock.rider.findUnique.mockResolvedValue(rider());
    prismaMock.riderPayStatement.findFirst.mockResolvedValue(null);
    prismaMock.ledgerEntry.findMany
      .mockResolvedValueOnce(
        overrides.earnings ?? [
          {
            id: "entry-1",
            entryType: "DELIVERY_EARNING",
            amount: "1000.00",
            currency: "INR",
            description: "Delivery earning",
            rentalId: RENTAL_ID,
            occurredAt: new Date("2026-01-01T10:00:00.000Z"),
          },
        ]
      )
      .mockResolvedValueOnce(overrides.debits ?? []);
    prismaMock.riderPayStatement.create.mockResolvedValue({
      id: STATEMENT_ID,
      statementNumber: "STL-ABC123",
    });
    prismaMock.riderPayStatementLine.create.mockResolvedValue({});
    prismaMock.ledgerEntry.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.rentalCollectionDue.findMany.mockResolvedValue(
      overrides.dues ?? [
        {
          id: DUE_ID,
          rentalId: RENTAL_ID,
          amountCollected: "0.00",
          outstandingAmount: "300.00",
          dueDate: new Date("2026-01-01T00:00:00.000Z"),
          periodStart: new Date("2026-01-01T00:00:00.000Z"),
          periodEnd: new Date("2026-01-02T00:00:00.000Z"),
          rental: { rentalNumber: "RN-1", currency: "INR" },
        },
      ]
    );
    prismaMock.rentalCollectionDue.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.collection.create.mockResolvedValue({ id: COLLECTION_ID });
    prismaMock.ledgerEntry.create.mockResolvedValue({});
    prismaMock.ledgerEntry.create.mockResolvedValue({ id: "deduction-1" });
    prismaMock.riderPayStatement.update.mockResolvedValue(statementDetail());
  }

  it("deducts outstanding rent and marks the payStatement PAYABLE", async () => {
    authenticate([{ resource: "payStatement", action: "generate" }]);
    mockGeneration();

    const res = await request(app)
      .post("/pay-statements/generate")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ riderId: RIDER_ID, date: "2026-01-01", cycle: "SAME_DAY" });

    expect(res.status).toBe(201);
    expect(res.body.data.duplicate).toBe(false);
    expect(prismaMock.collection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          payerType: "RIDER",
          riderId: RIDER_ID,
          rentalId: RENTAL_ID,
          amount: expect.anything(),
          status: "CLEARED",
        }),
      })
    );
    expect(prismaMock.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "RENT_DEDUCTION",
          direction: "DEBIT",
          payStatementId: STATEMENT_ID,
        }),
      })
    );

    const update = prismaMock.riderPayStatement.update.mock.calls[0][0];
    expect(update.data.status).toBe("PAYABLE");
    expect(update.data.grossEarnings.toString()).toBe("1000");
    expect(update.data.totalDeductions.toString()).toBe("300");
    expect(update.data.netPayable.toString()).toBe("700");
    expect(update.data.requiresManualReview).toBe(false);
  });

  it("applies unsettled debit adjustments and links them to the payStatement", async () => {
    authenticate([{ resource: "payStatement", action: "generate" }]);
    mockGeneration({
      debits: [
        {
          id: "adj-1",
          entryType: "ADJUSTMENT",
          amount: "100.00",
          currency: "INR",
          description: "Penalty adjustment",
          rentalId: null,
          occurredAt: new Date("2026-01-01T09:00:00.000Z"),
        },
      ],
    });

    const res = await request(app)
      .post("/pay-statements/generate")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ riderId: RIDER_ID, date: "2026-01-01" });

    expect(res.status).toBe(201);
    const update = prismaMock.riderPayStatement.update.mock.calls[0][0];
    expect(update.data.totalDeductions.toString()).toBe("400");
    expect(update.data.netPayable.toString()).toBe("600");

    expect(prismaMock.riderPayStatementLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ledgerEntryId: "adj-1",
          lineType: "ADJUSTMENT",
          direction: "DEBIT",
          amount: "100.00",
        }),
      })
    );

    const link = prismaMock.ledgerEntry.updateMany.mock.calls[0][0];
    expect(link.where.id.in).toEqual(
      expect.arrayContaining(["entry-1", "adj-1"])
    );
  });

  it("labels credit adjustment lines as ADJUSTMENT", async () => {
    authenticate([{ resource: "payStatement", action: "generate" }]);
    mockGeneration({
      earnings: [
        {
          id: "adj-credit",
          entryType: "ADJUSTMENT",
          amount: "500.00",
          currency: "INR",
          description: "Bonus adjustment",
          rentalId: null,
          occurredAt: new Date("2026-01-01T09:00:00.000Z"),
        },
      ],
    });

    const res = await request(app)
      .post("/pay-statements/generate")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ riderId: RIDER_ID, date: "2026-01-01" });

    expect(res.status).toBe(201);
    expect(prismaMock.riderPayStatementLine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ledgerEntryId: "adj-credit",
          lineType: "ADJUSTMENT",
          direction: "CREDIT",
        }),
      })
    );
  });

  it("marks a zero-net payStatement PAID without creating a payout", async () => {
    authenticate([{ resource: "payStatement", action: "generate" }]);
    mockGeneration({
      earnings: [
        {
          id: "entry-1",
          entryType: "DELIVERY_EARNING",
          amount: "100.00",
          currency: "INR",
          description: "Delivery earning",
          rentalId: RENTAL_ID,
          occurredAt: new Date("2026-01-01T10:00:00.000Z"),
        },
      ],
      dues: [
        {
          id: DUE_ID,
          rentalId: RENTAL_ID,
          amountCollected: "0.00",
          outstandingAmount: "100.00",
          dueDate: new Date("2026-01-01T00:00:00.000Z"),
          periodStart: new Date("2026-01-01T00:00:00.000Z"),
          periodEnd: new Date("2026-01-02T00:00:00.000Z"),
          rental: { rentalNumber: "RN-1", currency: "INR" },
        },
      ],
    });

    const res = await request(app)
      .post("/pay-statements/generate")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ riderId: RIDER_ID, date: "2026-01-01" });

    expect(res.status).toBe(201);
    const update = prismaMock.riderPayStatement.update.mock.calls[0][0];
    expect(update.data.status).toBe("PAID");
    expect(update.data.netPayable.toString()).toBe("0");
    expect(update.data.paidAt).toBeInstanceOf(Date);
    expect(prismaMock.payout.create).not.toHaveBeenCalled();
  });

  it("flags a shortfall when deductions exceed earnings", async () => {
    authenticate([{ resource: "payStatement", action: "generate" }]);
    mockGeneration({
      earnings: [
        {
          id: "entry-1",
          amount: "100.00",
          currency: "INR",
          description: "Delivery earning",
          rentalId: RENTAL_ID,
          occurredAt: new Date("2026-01-01T10:00:00.000Z"),
        },
      ],
    });

    const res = await request(app)
      .post("/pay-statements/generate")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        riderId: RIDER_ID,
        date: "2026-01-01",
        manualDeductions: [
          {
            lineType: "OTHER_DEDUCTION",
            amount: "50",
            description: "Damage recovery",
          },
        ],
      });

    expect(res.status).toBe(201);
    const update = prismaMock.riderPayStatement.update.mock.calls[0][0];
    expect(update.data.status).toBe("DRAFT");
    expect(update.data.netPayable.toString()).toBe("0");
    expect(update.data.shortfallAmount.toString()).toBe("50");
    expect(update.data.requiresManualReview).toBe(true);
  });

  it("returns the existing payStatement for the same rider and period", async () => {
    authenticate([{ resource: "payStatement", action: "generate" }]);
    prismaMock.rider.findUnique.mockResolvedValue(rider());
    prismaMock.riderPayStatement.findFirst.mockResolvedValue(statementDetail());

    const res = await request(app)
      .post("/pay-statements/generate")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ riderId: RIDER_ID, date: "2026-01-01" });

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(prismaMock.riderPayStatement.create).not.toHaveBeenCalled();
  });
});

describe("POST /pay-statements/:id/approve", () => {
  it("approves a PAYABLE payStatement", async () => {
    authenticate([{ resource: "payStatement", action: "approve" }]);
    prismaMock.riderPayStatement.findFirst.mockResolvedValue({
      id: STATEMENT_ID,
    });
    prismaMock.riderPayStatement.findUnique.mockResolvedValue({
      id: STATEMENT_ID,
      statementNumber: "STL-ABC123",
      riderId: RIDER_ID,
      status: "PAYABLE",
      netPayable: "700.00",
      shortfallAmount: "0.00",
      requiresManualReview: false,
      version: 1,
    });
    prismaMock.riderPayStatement.update.mockResolvedValue(
      statementDetail({ status: "APPROVED" })
    );

    const res = await request(app)
      .post(`/pay-statements/${STATEMENT_ID}/approve`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(200);
    expect(prismaMock.riderPayStatement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "APPROVED",
          approvedById: "u1",
        }),
      })
    );
  });

  it("refuses to approve a payStatement that requires manual review", async () => {
    authenticate([{ resource: "payStatement", action: "approve" }]);
    prismaMock.riderPayStatement.findFirst.mockResolvedValue({
      id: STATEMENT_ID,
    });
    prismaMock.riderPayStatement.findUnique.mockResolvedValue({
      id: STATEMENT_ID,
      statementNumber: "STL-ABC123",
      riderId: RIDER_ID,
      status: "PAYABLE",
      netPayable: "0.00",
      shortfallAmount: "50.00",
      requiresManualReview: true,
      version: 1,
    });

    const res = await request(app)
      .post(`/pay-statements/${STATEMENT_ID}/approve`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({});

    expect(res.status).toBe(409);
    expect(prismaMock.riderPayStatement.update).not.toHaveBeenCalled();
  });
});

describe("POST /pay-statements/:id/pay", () => {
  it("pays an approved payStatement and writes a PAYOUT ledger entry", async () => {
    authenticate([{ resource: "payStatement", action: "pay" }]);
    prismaMock.riderPayStatement.findFirst.mockResolvedValue({
      id: STATEMENT_ID,
    });
    prismaMock.riderPayStatement.findUnique.mockResolvedValue({
      id: STATEMENT_ID,
      statementNumber: "STL-ABC123",
      riderId: RIDER_ID,
      status: "APPROVED",
      currency: "INR",
      netPayable: "700.00",
      paidAt: null,
    });
    prismaMock.payout.findUnique.mockResolvedValue(null);
    prismaMock.payout.create.mockResolvedValue({
      id: PAYOUT_ID,
      amount: "700.00",
      status: "PAID",
    });
    prismaMock.ledgerEntry.create.mockResolvedValue({});
    prismaMock.riderPayStatement.update.mockResolvedValue({
      id: STATEMENT_ID,
      statementNumber: "STL-ABC123",
      status: "PAID",
      netPayable: "700.00",
      paidAt: new Date("2026-01-02T00:00:00.000Z"),
    });

    const res = await request(app)
      .post(`/pay-statements/${STATEMENT_ID}/pay`)
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ paymentMethod: "UPI", referenceNumber: "PAY-1" });

    expect(res.status).toBe(201);
    expect(prismaMock.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientType: "RIDER",
          riderId: RIDER_ID,
          payStatementId: STATEMENT_ID,
          status: "PAID",
        }),
      })
    );
    expect(prismaMock.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entryType: "PAYOUT",
          direction: "DEBIT",
          payStatementId: STATEMENT_ID,
        }),
      })
    );
    expect(prismaMock.riderPayStatement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAID" }),
      })
    );
  });
});
