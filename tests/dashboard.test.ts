import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

function authUser(permissions: { resource: string; action: string }[]) {
  return {
    id: "u1",
    name: "Tester",
    status: "ACTIVE",
    role: { name: "SUPERVISOR", permissions },
  };
}

beforeEach(() => {
  for (const delegate of [
    "vehicle",
    "rider",
    "riderVerification",
    "collection",
    "rentalCollectionDue",
    "deposit",
    "vehicleStatusHistory",
    "riderStatusHistory",
    "user",
  ]) {
    prismaMock[delegate].findMany?.mockReset?.();
    prismaMock[delegate].groupBy?.mockReset?.();
  }
});

describe("GET /dashboard", () => {
  it("returns live counts, collection dues and deposit balances", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      authUser([{ resource: "dashboard", action: "read" }])
    );
    prismaMock.vehicle.groupBy.mockResolvedValue([
      { status: "IDLE", _count: { _all: 2 } },
      { status: "DEPLOYED", _count: { _all: 1 } },
    ]);
    prismaMock.rider.groupBy.mockResolvedValue([
      { status: "ACTIVE", _count: { _all: 1 } },
    ]);
    prismaMock.riderVerification.groupBy.mockResolvedValue([
      { type: "PVC", status: "VERIFIED", _count: { _all: 1 } },
    ]);
    prismaMock.collection.groupBy.mockResolvedValue([
      {
        status: "CLEARED",
        payerType: "RIDER",
        _sum: { amount: 100 },
        _count: { _all: 1 },
      },
    ]);
    prismaMock.rentalCollectionDue.groupBy.mockImplementation(
      async (args: any) =>
        args.where?.rental?.rentalType === "B2C"
          ? [
              {
                status: "PENDING",
                _sum: {
                  amountDue: 100,
                  amountCollected: 20,
                  outstandingAmount: 80,
                },
                _count: { _all: 1 },
              },
            ]
          : [
              {
                status: "OVERDUE",
                _sum: {
                  amountDue: 200,
                  amountCollected: 0,
                  outstandingAmount: 200,
                },
                _count: { _all: 1 },
              },
            ]
    );
    prismaMock.deposit.findMany.mockResolvedValue([
      {
        id: "d1",
        payerType: "RIDER",
        status: "REQUIRED",
        amountRequired: 500,
        transactions: [
          { type: "RECEIPT", direction: "CREDIT", amount: 200 },
          { type: "REFUND", direction: "DEBIT", amount: 50 },
        ],
      },
    ]);
    prismaMock.vehicle.findMany.mockResolvedValue([]);
    prismaMock.rider.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/dashboard")
      .query({
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-31T23:59:59.999Z",
        groupBy: "DAILY",
      })
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.dashboard.live.vehicles.total).toBe(3);
    expect(res.body.data.dashboard.live.vehicles.byStatus.RETIRED).toBe(0);
    expect(res.body.data.dashboard.live.riders.verifications.byType.PVC).toMatchObject({
      VERIFIED: 1,
      PENDING: 0,
    });
    expect(res.body.data.dashboard.collectionDue).toMatchObject({
      totalCollections: 1,
      totalCollectedAmount: "100",
      totalPendingAmount: "80",
      totalOverdueAmount: "200",
      collectionsDue: 2,
      overdueCollections: 1,
    });
    expect(res.body.data.dashboard.deposits).toMatchObject({
      totalDeposits: 1,
      totalReceivedAmount: "200",
      totalRefundedAmount: "50",
      outstandingDepositAmount: "300",
    });
  });

  it("exposes vehicle and rider trends separately", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      authUser([{ resource: "dashboard", action: "read" }])
    );
    prismaMock.vehicle.findMany.mockResolvedValue([]);
    prismaMock.rider.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get("/dashboard/trends")
      .query({
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-02T23:59:59.999Z",
      })
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.trends.vehicle.periods).toHaveLength(2);
    expect(res.body.data.trends.rider.periods).toHaveLength(2);
    expect(res.body.data.trends.vehicle.timezone).toBe("UTC");
  });

  it("requires dashboard:read", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      authUser([{ resource: "report", action: "read" }])
    );

    const res = await request(app)
      .get("/dashboard")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
  });
});
