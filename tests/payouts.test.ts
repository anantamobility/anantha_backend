import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const PAYOUT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b03";
const SETTLEMENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01";
const RIDER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a8e";

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

function payout(overrides: Record<string, unknown> = {}) {
  return {
    id: PAYOUT_ID,
    settlementId: SETTLEMENT_ID,
    riderId: RIDER_ID,
    amount: "700.00",
    currency: "INR",
    status: "PAID",
    paidAt: new Date("2026-01-02T00:00:00.000Z"),
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
  prismaMock.payout.findMany.mockResolvedValue([]);
  prismaMock.payout.count.mockResolvedValue(0);
});

describe("GET /payouts", () => {
  it("lists payouts with pagination", async () => {
    authenticate([{ resource: "payout", action: "read" }]);
    prismaMock.payout.findMany.mockResolvedValue([payout()]);
    prismaMock.payout.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/payouts")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.payouts).toHaveLength(1);
    expect(res.body.data.pagination.total).toBe(1);
  });
});

describe("GET /payouts/:id", () => {
  it("returns a payout by id", async () => {
    authenticate([{ resource: "payout", action: "read" }]);
    prismaMock.payout.findFirst.mockResolvedValue({ id: PAYOUT_ID });
    prismaMock.payout.findUnique.mockResolvedValue(payout());

    const res = await request(app)
      .get(`/payouts/${PAYOUT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.payout.id).toBe(PAYOUT_ID);
  });

  it("returns 404 when the payout does not exist", async () => {
    authenticate([{ resource: "payout", action: "read" }]);
    prismaMock.payout.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .get(`/payouts/${PAYOUT_ID}`)
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(404);
  });
});
