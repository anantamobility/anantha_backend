import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const RIDER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";
const RENTAL_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const ENTRY_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01";

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

function earning(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    riderId: RIDER_ID,
    entryType: "DELIVERY_EARNING",
    direction: "CREDIT",
    amount: "100.00",
    currency: "INR",
    occurredAt: new Date("2026-01-01T10:00:00.000Z"),
    description: "Delivery earning",
    settlementId: null,
    rentalId: RENTAL_ID,
    idempotencyKey: `earning:${RIDER_ID}:DEL-1`,
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
  prismaMock.earningsLedger.findMany.mockResolvedValue([]);
  prismaMock.earningsLedger.count.mockResolvedValue(0);
  prismaMock.auditLog.create.mockResolvedValue({});
});

describe("POST /earnings", () => {
  it("records an idempotent B2C delivery earning", async () => {
    authenticate([{ resource: "earning", action: "create" }]);
    prismaMock.rider.findUnique.mockResolvedValue(rider());
    prismaMock.rental.findUnique.mockResolvedValue({
      id: RENTAL_ID,
      rentalNumber: "RN-ABC12345",
      rentalType: "B2C",
      riderId: RIDER_ID,
      currency: "INR",
    });
    prismaMock.earningsLedger.findUnique.mockResolvedValue(null);
    prismaMock.earningsLedger.create.mockResolvedValue(earning());

    const res = await request(app)
      .post("/earnings")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        riderId: RIDER_ID,
        rentalId: RENTAL_ID,
        amount: "100",
        referenceNumber: "DEL-1",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.entry.id).toBe(ENTRY_ID);
    expect(prismaMock.earningsLedger.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          riderId: RIDER_ID,
          entryType: "DELIVERY_EARNING",
          direction: "CREDIT",
          idempotencyKey: `earning:${RIDER_ID}:DEL-1`,
        }),
      })
    );
    expect(prismaMock.auditLog.create).toHaveBeenCalled();
  });

  it("returns the existing entry for a duplicate reference", async () => {
    authenticate([{ resource: "earning", action: "create" }]);
    prismaMock.rider.findUnique.mockResolvedValue(rider());
    prismaMock.rental.findUnique.mockResolvedValue({
      id: RENTAL_ID,
      rentalNumber: "RN-ABC12345",
      rentalType: "B2C",
      riderId: RIDER_ID,
      currency: "INR",
    });
    prismaMock.earningsLedger.findUnique.mockResolvedValue(earning());

    const res = await request(app)
      .post("/earnings")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        riderId: RIDER_ID,
        rentalId: RENTAL_ID,
        amount: "100",
        referenceNumber: "DEL-1",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(prismaMock.earningsLedger.create).not.toHaveBeenCalled();
  });

  it("rejects earning creation without the earning:create permission", async () => {
    authenticate([{ resource: "earning", action: "read" }]);

    const res = await request(app)
      .post("/earnings")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({ riderId: RIDER_ID, amount: "100" });

    expect(res.status).toBe(403);
  });
});

describe("GET /earnings/summary", () => {
  it("separates settled and available earnings", async () => {
    authenticate([{ resource: "earning", action: "read" }]);
    prismaMock.rider.findUnique.mockResolvedValue(rider());
    prismaMock.earningsLedger.findMany.mockResolvedValue([
      {
        direction: "CREDIT",
        amount: "100.00",
        settlementId: null,
        entryType: "DELIVERY_EARNING",
      },
      {
        direction: "DEBIT",
        amount: "20.00",
        settlementId: null,
        entryType: "ADJUSTMENT",
      },
      {
        direction: "CREDIT",
        amount: "500.00",
        settlementId: "settled-1",
        entryType: "DELIVERY_EARNING",
      },
    ]);

    const res = await request(app)
      .get(`/earnings/summary?riderId=${RIDER_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.availableBalance).toBe("80");
    expect(res.body.data.settledCredits).toBe("500");
    expect(res.body.data.unsettledEntryCount).toBe(2);
  });
});

describe("POST /earnings/adjustments", () => {
  it("returns the existing entry on an idempotent debit retry", async () => {
    authenticate([{ resource: "earning", action: "adjust" }]);
    prismaMock.rider.findUnique.mockResolvedValue(rider());
    prismaMock.earningsLedger.findUnique.mockResolvedValue(
      earning({
        entryType: "ADJUSTMENT",
        direction: "DEBIT",
        idempotencyKey: "adj-retry",
      })
    );
    // The first debit already consumed the balance; the retry must still
    // return the original entry instead of failing the balance check.
    prismaMock.earningsLedger.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post("/earnings/adjustments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        riderId: RIDER_ID,
        amount: "100",
        direction: "DEBIT",
        reason: "Correction",
        idempotencyKey: "adj-retry",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(prismaMock.earningsLedger.create).not.toHaveBeenCalled();
  });

  it("rejects a debit adjustment that exceeds the available balance", async () => {
    authenticate([{ resource: "earning", action: "adjust" }]);
    prismaMock.rider.findUnique.mockResolvedValue(rider());
    prismaMock.earningsLedger.findMany.mockResolvedValue([
      {
        direction: "CREDIT",
        amount: "50.00",
        settlementId: null,
      },
    ]);

    const res = await request(app)
      .post("/earnings/adjustments")
      .set("Authorization", `Bearer ${accessToken()}`)
      .send({
        riderId: RIDER_ID,
        amount: "60",
        direction: "DEBIT",
        reason: "Correction",
      });

    expect(res.status).toBe(409);
    expect(prismaMock.earningsLedger.create).not.toHaveBeenCalled();
  });
});
