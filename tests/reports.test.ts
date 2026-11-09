import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;

const reportModels = [
  "collection",
  "hub",
  "rental",
  "rider",
  "vehicle",
  "service",
  "spare",
  "inventoryBalance",
  "staff",
];

function authUser(permissions: { resource: string; action: string }[]) {
  return {
    id: "u1",
    name: "Tester",
    status: "ACTIVE",
    role: { name: "SUPERVISOR", permissions },
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findUnique.mockResolvedValue(
    authUser([{ resource: "report", action: "read" }])
  );

  for (const model of reportModels) {
    prismaMock[model].findMany.mockReset();
    prismaMock[model].findMany.mockResolvedValue([]);
    prismaMock[model].count.mockReset();
    prismaMock[model].count.mockResolvedValue(0);
  }
});

describe("GET /reports", () => {
  it.each([
    "/reports/collections",
    "/reports/hubs",
    "/reports/b2c",
    "/reports/b2b",
    "/reports/riders",
    "/reports/vehicles",
    "/reports/services",
    "/reports/spares",
    "/reports/inventory",
    "/reports/staff",
  ])("returns a paginated report for %s", async (path) => {
    const res = await request(app)
      .get(path)
      .query({
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-31T23:59:59.999Z",
      })
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.report.rows).toEqual([]);
    expect(res.body.data.report.filters).toMatchObject({
      startDate: "2026-01-01T00:00:00.000Z",
      endDate: "2026-01-31T23:59:59.999Z",
    });
    expect(res.body.data.report.pagination).toMatchObject({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    });
  });

  it("exports CSV with escaped cell values", async () => {
    prismaMock.collection.findMany.mockResolvedValue([
      {
        id: "c1",
        receivedAt: new Date("2026-01-02T00:00:00.000Z"),
        payerType: "RIDER",
        amount: "125.50",
        currency: "INR",
        paymentMethod: "UPI",
        referenceNumber: "REF,1",
        status: "CLEARED",
        notes: 'Paid "in full"',
        reconciledAt: null,
        client: null,
        rider: { riderCode: "R1", fullName: "Ravi" },
        rental: {
          rentalNumber: "RN1",
          rentalType: "B2C",
          hub: { code: "H1", name: "Main" },
        },
        receivedBy: { name: "Tester" },
      },
    ]);
    prismaMock.collection.count.mockResolvedValue(1);

    const res = await request(app)
      .get("/reports/collections")
      .query({ format: "csv" })
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain(
      'filename="collections.csv"'
    );
    expect(res.text).toContain('"Collection ID"');
    expect(res.text).toContain('"REF,1"');
    expect(res.text).toContain('"Paid ""in full"""');
  });

  it("requires report:read", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      authUser([{ resource: "dashboard", action: "read" }])
    );

    const res = await request(app)
      .get("/reports/collections")
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(403);
  });

  it("rejects an inverted date range", async () => {
    const res = await request(app)
      .get("/reports/vehicles")
      .query({
        startDate: "2026-02-01T00:00:00.000Z",
        endDate: "2026-01-01T00:00:00.000Z",
      })
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
  });
});
