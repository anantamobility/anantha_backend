import { describe, it, expect } from "vitest";
import {
  addMonthsUtc,
  buildDuePeriods,
  calculateDueAmount,
  deriveDueStatus,
  toDecimal,
} from "../src/services/rental-schedule.js";

describe("buildDuePeriods", () => {
  it("advances weekly periods by seven days from the rental start", () => {
    const periods = buildDuePeriods({
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      period: "WEEKLY",
      throughDate: new Date("2026-01-15T00:00:00.000Z"),
    });

    expect(periods).toHaveLength(3);
    expect(periods[0].periodStart.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z"
    );
    expect(periods[1].periodStart.toISOString()).toBe(
      "2026-01-08T00:00:00.000Z"
    );
    expect(periods[2].periodEnd.toISOString()).toBe(
      "2026-01-22T00:00:00.000Z"
    );
  });

  it("clamps monthly periods to the last day of shorter months", () => {
    expect(addMonthsUtc(new Date("2026-01-31T00:00:00.000Z"), 1).toISOString())
      .toBe("2026-02-28T00:00:00.000Z");

    const periods = buildDuePeriods({
      startDate: new Date("2026-01-31T00:00:00.000Z"),
      period: "MONTHLY",
      throughDate: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(periods).toHaveLength(2);
    expect(periods[0].periodEnd.toISOString()).toBe(
      "2026-02-28T00:00:00.000Z"
    );
    expect(periods[1].periodEnd.toISOString()).toBe(
      "2026-03-31T00:00:00.000Z"
    );
  });
});

describe("calculateDueAmount", () => {
  const rates = {
    dailyRate: "100.00",
    weeklyRate: "600.00",
    fortnightlyRate: "1200.00",
    monthlyRate: "2000.00",
  };

  it("uses the weekly rate for a full weekly period", () => {
    const amount = calculateDueAmount({
      period: "WEEKLY",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-01-08T00:00:00.000Z"),
      rates,
    });
    expect(amount.toString()).toBe("600");
  });

  it("uses the fortnightly rate for a full 15-day period", () => {
    const amount = calculateDueAmount({
      period: "EVERY_15_DAYS",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-01-16T00:00:00.000Z"),
      rates,
    });
    expect(amount.toString()).toBe("1200");
  });

  it("uses the monthly rate for a full calendar month", () => {
    const amount = calculateDueAmount({
      period: "MONTHLY",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-02-01T00:00:00.000Z"),
      rates,
    });
    expect(amount.toString()).toBe("2000");
  });

  it("falls back to the daily rate when the period rate is missing", () => {
    const amount = calculateDueAmount({
      period: "MONTHLY",
      periodStart: new Date("2026-01-01T00:00:00.000Z"),
      periodEnd: new Date("2026-02-01T00:00:00.000Z"),
      rates: { dailyRate: "100.00", monthlyRate: null },
    });
    expect(amount.toString()).toBe("3100");
  });

  it("rejects generation when no usable rate exists", () => {
    expect(() =>
      calculateDueAmount({
        period: "WEEKLY",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEnd: new Date("2026-01-08T00:00:00.000Z"),
        rates: { dailyRate: null, weeklyRate: null },
      })
    ).toThrow(/no daily rate/i);
  });
});
describe("deriveDueStatus", () => {
  const now = new Date("2026-02-01T00:00:00.000Z");

  it("marks a settled due as PAID", () => {
    expect(
      deriveDueStatus({
        amountCollected: toDecimal("100"),
        outstandingAmount: toDecimal("0"),
        dueDate: new Date("2026-01-01T00:00:00.000Z"),
        now,
      })
    ).toBe("PAID");
  });

  it("marks an unpaid past due as OVERDUE", () => {
    expect(
      deriveDueStatus({
        amountCollected: toDecimal("0"),
        outstandingAmount: toDecimal("100"),
        dueDate: new Date("2026-01-01T00:00:00.000Z"),
        now,
      })
    ).toBe("OVERDUE");
  });

  it("marks a partially collected current due as PARTIALLY_PAID", () => {
    expect(
      deriveDueStatus({
        amountCollected: toDecimal("50"),
        outstandingAmount: toDecimal("50"),
        dueDate: new Date("2026-03-01T00:00:00.000Z"),
        now,
      })
    ).toBe("PARTIALLY_PAID");
  });
});
