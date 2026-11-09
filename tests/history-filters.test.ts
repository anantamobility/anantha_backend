import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import prisma from "../src/database/prismaClient.js";
import { accessToken } from "./helpers/auth.js";

const prismaMock = prisma as any;
const VEHICLE_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const RIDER_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

function authUser(permissions: { resource: string; action: string }[]) {
  return {
    id: "u1",
    name: "Tester",
    status: "ACTIVE",
    role: { name: "ADMIN", permissions },
  };
}

beforeEach(() => {
  prismaMock.user.findUnique.mockReset();
  prismaMock.vehicle.findUnique.mockReset();
  prismaMock.vehicle.findFirst.mockReset();
  prismaMock.rider.findUnique.mockReset();
  prismaMock.rider.findFirst.mockReset();
  prismaMock.vehicleStatusHistory.findMany.mockReset();
  prismaMock.vehicleStatusHistory.count.mockReset();
  prismaMock.riderStatusHistory.findMany.mockReset();
  prismaMock.riderStatusHistory.count.mockReset();
});

describe("status history filters", () => {
  it("filters and sorts vehicle status history", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      authUser([{ resource: "vehicle", action: "history:read" }])
    );
    prismaMock.vehicle.findFirst.mockResolvedValue({ id: VEHICLE_ID });
    prismaMock.vehicle.findUnique.mockResolvedValue({
      id: VEHICLE_ID,
      deletedAt: null,
    });
    prismaMock.vehicleStatusHistory.findMany.mockResolvedValue([]);
    prismaMock.vehicleStatusHistory.count.mockResolvedValue(0);

    const res = await request(app)
      .get(`/vehicles/${VEHICLE_ID}/status-history`)
      .query({
        status: "DEPLOYED",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-01-31T23:59:59.999Z",
        sortBy: "status",
        sortOrder: "asc",
        page: 2,
        limit: 5,
      })
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    const args = prismaMock.vehicleStatusHistory.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      vehicleId: VEHICLE_ID,
      status: "DEPLOYED",
      changedAt: {
        gte: new Date("2026-01-01T00:00:00.000Z"),
        lte: new Date("2026-01-31T23:59:59.999Z"),
      },
    });
    expect(args.orderBy).toEqual([
      { status: "asc" },
      { changedAt: "desc" },
      { id: "desc" },
    ]);
    expect(args.skip).toBe(5);
    expect(args.take).toBe(5);
  });

  it("filters rider status history by date and status", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      authUser([{ resource: "rider", action: "history:read" }])
    );
    prismaMock.rider.findFirst.mockResolvedValue({ id: RIDER_ID });
    prismaMock.rider.findUnique.mockResolvedValue({
      id: RIDER_ID,
      deletedAt: null,
    });
    prismaMock.riderStatusHistory.findMany.mockResolvedValue([]);
    prismaMock.riderStatusHistory.count.mockResolvedValue(0);

    const res = await request(app)
      .get(`/riders/${RIDER_ID}/status-history`)
      .query({
        status: "ACTIVE",
        startDate: "2026-02-01T00:00:00.000Z",
        sortBy: "changedAt",
        sortOrder: "asc",
      })
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(200);
    const args = prismaMock.riderStatusHistory.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      riderId: RIDER_ID,
      status: "ACTIVE",
      changedAt: { gte: new Date("2026-02-01T00:00:00.000Z") },
    });
    expect(args.orderBy).toEqual([{ changedAt: "asc" }, { id: "desc" }]);
  });

  it("rejects an inverted history date range", async () => {
    prismaMock.user.findUnique.mockResolvedValue(
      authUser([{ resource: "vehicle", action: "history:read" }])
    );
    prismaMock.vehicle.findFirst.mockResolvedValue({ id: VEHICLE_ID });

    const res = await request(app)
      .get(`/vehicles/${VEHICLE_ID}/status-history`)
      .query({
        startDate: "2026-02-01T00:00:00.000Z",
        endDate: "2026-01-01T00:00:00.000Z",
      })
      .set("Authorization", `Bearer ${accessToken()}`);

    expect(res.status).toBe(400);
    expect(prismaMock.vehicleStatusHistory.findMany).not.toHaveBeenCalled();
  });
});
