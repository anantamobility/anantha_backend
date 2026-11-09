import { Prisma } from "../generated/prisma/client.js";
import { AppError, ErrorCode } from "../utils/errors.js";
import type { CollectionPeriod } from "../validation/rental.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function toDecimal(
  value: string | number | Prisma.Decimal | null | undefined
): Prisma.Decimal {
  if (value === null || value === undefined) return new Prisma.Decimal(0);
  return new Prisma.Decimal(value);
}

export function addDaysUtc(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function periodStartFor(
  rentalStartDate: Date,
  period: CollectionPeriod,
  index: number
): Date {
  if (period === "WEEKLY") return addDaysUtc(rentalStartDate, index * 7);
  if (period === "EVERY_15_DAYS") {
    return addDaysUtc(rentalStartDate, index * 15);
  }
  return addMonthsUtc(rentalStartDate, index);
}

export type DuePeriod = { periodStart: Date; periodEnd: Date };

/**
 * Builds deterministic, non-overlapping billing periods.
 *
 * A period is generated when its start is on or before `throughDate`. The
 * final period may extend beyond an agreed rental end date; the business rule
 * for mid-period early closure is documented as an open decision in
 * docs/rentals-collections.md (current convention: final period billed in
 * full).
 */
export function buildDuePeriods(input: {
  startDate: Date;
  period: CollectionPeriod;
  throughDate: Date;
  maxPeriods?: number;
}): DuePeriod[] {
  const { startDate, period, throughDate } = input;
  const maxPeriods = input.maxPeriods ?? 1000;
  const periods: DuePeriod[] = [];

  for (let index = 0; index < maxPeriods; index += 1) {
    const periodStart = periodStartFor(startDate, period, index);
    if (periodStart.getTime() > throughDate.getTime()) break;

    const periodEnd = periodStartFor(startDate, period, index + 1);
    periods.push({ periodStart, periodEnd });
  }

  return periods;
}

export function daysInPeriod(periodStart: Date, periodEnd: Date): number {
  return Math.round(
    (periodEnd.getTime() - periodStart.getTime()) / MS_PER_DAY
  );
}

export type RentalRateFields = {
  dailyRate: unknown;
  weeklyRate?: unknown;
  fortnightlyRate?: unknown;
  monthlyRate?: unknown;
};

/**
 * Amount for one due period.
 *
 * Convention:
 * - WEEKLY uses weeklyRate for a full 7-day period.
 * - EVERY_15_DAYS uses fortnightlyRate for a full 15-day period.
 * - MONTHLY uses monthlyRate for a full calendar-month period.
 * - Anything else falls back to dailyRate * number of days in the period.
 *
 * Calendar-month and 30-day billing are deliberately not treated as identical:
 * monthly periods advance by UTC calendar month and the fallback uses actual
 * days in that calendar period.
 */
export function calculateDueAmount(input: {
  period: CollectionPeriod;
  periodStart: Date;
  periodEnd: Date;
  rates: RentalRateFields;
}): Prisma.Decimal {
  const { period, periodStart, periodEnd, rates } = input;
  const days = daysInPeriod(periodStart, periodEnd);

  if (period === "WEEKLY" && rates.weeklyRate != null && days === 7) {
    return toDecimal(rates.weeklyRate as string).toDecimalPlaces(2);
  }

  if (
    period === "EVERY_15_DAYS" &&
    rates.fortnightlyRate != null &&
    days === 15
  ) {
    return toDecimal(rates.fortnightlyRate as string).toDecimalPlaces(2);
  }

  if (period === "MONTHLY" && rates.monthlyRate != null) {
    const fullMonthEnd = addMonthsUtc(periodStart, 1);
    if (fullMonthEnd.getTime() === periodEnd.getTime()) {
      return toDecimal(rates.monthlyRate as string).toDecimalPlaces(2);
    }
  }

  if (rates.dailyRate == null) {
    throw new AppError(
      "Rental has no daily rate and no matching period rate for due generation",
      409,
      ErrorCode.CONFLICT
    );
  }

  return toDecimal(rates.dailyRate as string)
    .mul(days)
    .toDecimalPlaces(2);
}

export function deriveDueStatus(input: {
  amountCollected: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
  dueDate: Date;
  now?: Date;
}): "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" {
  const now = input.now ?? new Date();
  if (input.outstandingAmount.lte(0)) return "PAID";
  if (input.dueDate.getTime() < now.getTime()) return "OVERDUE";
  if (input.amountCollected.gt(0)) return "PARTIALLY_PAID";
  return "PENDING";
}
