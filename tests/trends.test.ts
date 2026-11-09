import { describe, it, expect, beforeEach } from "vitest";
import prisma from "../src/database/prismaClient.js";
import {
  buildTrendPeriods,
  getVehicleTrends,
} from "../src/services/trends.js";

const prismaMock = prisma as any;

beforeEach(() => {
  prismaMock.vehicle.findMany.mockReset();
  prismaMock.vehicleStatusHistory.findMany.mockReset();
});

describe("buildTrendPeriods", () => {
  it("aligns weekly periods to Monday and clips the range", () => {
    const periods = buildTrendPeriods(
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-11T23:59:59.999Z"),
      "WEEKLY"
    );

    expect(periods).toHaveLength(2);
    expect(periods[0]).toEqual({
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-01-04T23:59:59.999Z"),
    });
    expect(periods[1]).toEqual({
      periodStart: new Date("2026-01-05T00:00:00.000Z"),
      periodEnd: new Date("2026-01-11T23:59:59.999Z"),
    });
  });

  it("builds monthly periods clipped to the requested range", () => {
    const periods = buildTrendPeriods(
      new Date("2026-01-15T00:00:00.000Z"),
      new Date("2026-02-10T00:00:00.000Z"),
      "MONTHLY"
    );

    expect(periods).toEqual([
      {
        periodStart: new Date("2026-01-15T00:00:00.000Z"),
        periodEnd: new Date("2026-01-31T23:59:59.999Z"),
      },
      {
        periodStart: new Date("2026-02-01T00:00:00.000Z"),
        periodEnd: new Date("2026-02-10T00:00:00.000Z"),
      },
    ]);
  });
});

describe("getVehicleTrends", () => {
  it("derives historical status counts from transitions and creation dates", async () => {
    prismaMock.vehicle.findMany.mockResolvedValue([
      {
        id: "v1",
        status: "DEPLOYED",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "v2",
        status: "IDLE",
        createdAt: new Date("2026-01-02T12:00:00.000Z"),
      },
    ]);
    prismaMock.vehicleStatusHistory.findMany.mockResolvedValue([
      {
        id: "h1",
        vehicleId: "v1",
        previousStatus: "IDLE",
        status: "DEPLOYED",
        changedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
    ]);

    const result = await getVehicleTrends({
      groupBy: "DAILY",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-01-03T23:59:59.999Z"),
    });

    expect(result.periods).toHaveLength(3);
    expect(result.periods[0]).toMatchObject({
      counts: expect.objectContaining({ IDLE: 1, DEPLOYED: 0, RETIRED: 0 }),
      total: 1,
      unknown: 0,
    });
    expect(result.periods[1]).toMatchObject({
      counts: expect.objectContaining({ IDLE: 1, DEPLOYED: 1 }),
      total: 2,
      unknown: 0,
    });
    expect(result.periods[2]).toMatchObject({
      counts: expect.objectContaining({ IDLE: 1, DEPLOYED: 1 }),
      total: 2,
      unknown: 0,
    });
  });
});
