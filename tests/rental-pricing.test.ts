import { describe, it, expect, beforeEach } from "vitest";
import prisma from "../src/database/prismaClient.js";
import { resolveRentalPricing } from "../src/services/rental-pricing.js";

const prismaMock = prisma as any;

const CLIENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const RATE_CARD_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a6c";
const ASSIGNMENT_ID = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a7d";
const EFFECTIVE_AT = new Date("2026-06-01T00:00:00.000Z");

function assignment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSIGNMENT_ID,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    validUntil: new Date("2026-12-31T00:00:00.000Z"),
    rateCard: {
      id: RATE_CARD_ID,
      code: "RC-STD",
      name: "Standard B2B",
      vehicleCategory: "BIKE",
      billingFrequency: "MONTHLY",
      dailyRate: "499.0000",
      weeklyRate: "2999.0000",
      fortnightlyRate: null,
      monthlyRate: "9999.0000",
      securityDeposit: "5000.00",
      currency: "INR",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: null,
      ...overrides,
    },
    ...overrides,
  };
}

beforeEach(() => {
  prismaMock.client.findUnique.mockReset();
  prismaMock.rateCardAssignment.findFirst.mockReset();
});

describe("resolveRentalPricing", () => {
  it("resolves an active assignment into a ratecard snapshot", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      deletedAt: null,
    });
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue(assignment());

    const result = await resolveRentalPricing({
      clientId: CLIENT_ID,
      rateCardId: RATE_CARD_ID,
      effectiveAt: EFFECTIVE_AT,
    });

    expect(result.source).toBe("RATE_CARD");
    expect(result.rateCardId).toBe(RATE_CARD_ID);
    expect(result.rateCardAssignmentId).toBe(ASSIGNMENT_ID);
    expect(result.billingFrequency).toBe("MONTHLY");
    expect(result.rates).toEqual({
      dailyRate: "499.0000",
      weeklyRate: "2999.0000",
      fortnightlyRate: null,
      monthlyRate: "9999.0000",
    });
    expect(result.securityDepositRequired).toBe("5000.00");
    expect(result.rateSnapshot).toMatchObject({
      source: "RATE_CARD",
      capturedAt: EFFECTIVE_AT.toISOString(),
      clientId: CLIENT_ID,
      rateCardId: RATE_CARD_ID,
      rateCardAssignmentId: ASSIGNMENT_ID,
      rateCardCode: "RC-STD",
      rateCardName: "Standard B2B",
      vehicleCategory: "BIKE",
      billingFrequency: "MONTHLY",
      currency: "INR",
      rateCardEffectiveFrom: new Date(
        "2026-01-01T00:00:00.000Z"
      ).toISOString(),
      rateCardEffectiveTo: null,
      assignmentValidFrom: new Date(
        "2026-01-01T00:00:00.000Z"
      ).toISOString(),
      assignmentValidUntil: new Date(
        "2026-12-31T00:00:00.000Z"
      ).toISOString(),
      securityDeposit: "5000.00",
    });
    expect(prismaMock.rateCardAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clientId: CLIENT_ID,
          rateCardId: RATE_CARD_ID,
          status: "ACTIVE",
          validFrom: { lte: EFFECTIVE_AT },
          OR: [
            { validUntil: null },
            { validUntil: { gte: EFFECTIVE_AT } },
          ],
          rateCard: {
            isActive: true,
            effectiveFrom: { lte: EFFECTIVE_AT },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: EFFECTIVE_AT } },
            ],
          },
        },
      })
    );
  });

  it("uses explicit manual pricing without requiring an assignment", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      deletedAt: null,
    });

    const result = await resolveRentalPricing({
      clientId: CLIENT_ID,
      effectiveAt: EFFECTIVE_AT,
      manualPricing: {
        dailyRate: "750.5",
        weeklyRate: 4500,
        monthlyRate: "15000.0000",
        securityDeposit: "2500",
        currency: "inr",
        notes: "One-off corporate rate",
      },
    });

    expect(result).toMatchObject({
      source: "MANUAL",
      clientId: CLIENT_ID,
      rateCardId: null,
      rateCardAssignmentId: null,
      billingFrequency: null,
      currency: "INR",
      rates: {
        dailyRate: "750.5",
        weeklyRate: "4500",
        fortnightlyRate: null,
        monthlyRate: "15000.0000",
      },
      securityDepositRequired: "2500",
    });
    expect(result.rateSnapshot).toMatchObject({
      source: "MANUAL",
      capturedAt: EFFECTIVE_AT.toISOString(),
      notes: "One-off corporate rate",
    });
    expect(prismaMock.rateCardAssignment.findFirst).not.toHaveBeenCalled();
  });

  it("allows manual pricing with only a daily rate and default currency", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      deletedAt: null,
    });

    const result = await resolveRentalPricing({
      clientId: CLIENT_ID,
      manualPricing: { dailyRate: "100" },
    });

    expect(result.currency).toBe("INR");
    expect(result.rates.dailyRate).toBe("100");
    expect(result.securityDepositRequired).toBeNull();
  });

  it("requires a ratecard or explicit manual pricing", async () => {
    await expect(
      resolveRentalPricing({ clientId: CLIENT_ID })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(prismaMock.client.findUnique).not.toHaveBeenCalled();
  });

  it("rejects supplying both pricing sources", async () => {
    await expect(
      resolveRentalPricing({
        clientId: CLIENT_ID,
        rateCardId: RATE_CARD_ID,
        manualPricing: { dailyRate: "100" },
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(prismaMock.client.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing or deleted client", async () => {
    prismaMock.client.findUnique.mockResolvedValue(null);
    await expect(
      resolveRentalPricing({
        clientId: CLIENT_ID,
        manualPricing: { dailyRate: "100" },
      })
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });

    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      deletedAt: new Date(),
    });
    await expect(
      resolveRentalPricing({
        clientId: CLIENT_ID,
        manualPricing: { dailyRate: "100" },
      })
    ).rejects.toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
  });

  it("rejects an unassigned, inactive or out-of-date ratecard", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      deletedAt: null,
    });
    prismaMock.rateCardAssignment.findFirst.mockResolvedValue(null);

    await expect(
      resolveRentalPricing({
        clientId: CLIENT_ID,
        rateCardId: RATE_CARD_ID,
        effectiveAt: EFFECTIVE_AT,
      })
    ).rejects.toMatchObject({ statusCode: 409, code: "CONFLICT" });
  });

  it("validates manual rates and currency", async () => {
    prismaMock.client.findUnique.mockResolvedValue({
      id: CLIENT_ID,
      deletedAt: null,
    });

    const invalidCases = [
      { dailyRate: undefined },
      { dailyRate: "0" },
      { dailyRate: "-1" },
      { dailyRate: "1.12345" },
      { dailyRate: "100", weeklyRate: "bad" },
      { dailyRate: "100", securityDeposit: "1.999" },
      { dailyRate: "100", currency: "RUPEE" },
    ];

    for (const manualPricing of invalidCases) {
      await expect(
        resolveRentalPricing({
          clientId: CLIENT_ID,
          manualPricing: manualPricing as any,
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
    }
  });
});
