import prisma from "../database/prismaClient.js";
import { AppError, ErrorCode } from "../utils/errors.js";
import type { TrendsQuery } from "../validation/reporting.js";

export type TrendGroup = "DAILY" | "WEEKLY" | "MONTHLY";
export type TrendStatus =
  | "IDLE"
  | "DEPLOYED"
  | "IN_SERVICE"
  | "UNDER_REPAIR"
  | "OUT_OF_SERVICE"
  | "RETIRED"
  | "ONBOARDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "INACTIVE"
  | "TERMINATED";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;

export const VEHICLE_TREND_STATUSES = [
  "IDLE",
  "DEPLOYED",
  "IN_SERVICE",
  "UNDER_REPAIR",
  "OUT_OF_SERVICE",
  "RETIRED",
] as const;

export const RIDER_TREND_STATUSES = [
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
  "TERMINATED",
] as const;

export type TrendPeriod = {
  periodStart: Date;
  periodEnd: Date;
};

type StatusHistoryRow = {
  id: string;
  status: string;
  previousStatus: string | null;
  changedAt: Date;
};

type TrendEntity = {
  id: string;
  status: string;
  createdAt: Date;
  deletedAt: Date | null;
};

export type TrendPeriodResult = {
  periodStart: Date;
  periodEnd: Date;
  counts: Record<string, number>;
  total: number;
  unknown: number;
};

export type StatusTrendResult = {
  groupBy: TrendGroup;
  timezone: "UTC";
  startDate: Date;
  endDate: Date;
  statuses: readonly string[];
  periods: TrendPeriodResult[];
};

export function resolveTrendRange(query: {
  startDate?: Date;
  endDate?: Date;
}): { startDate: Date; endDate: Date } {
  const endDate = query.endDate ?? new Date();
  const startDate =
    query.startDate ??
    new Date(endDate.getTime() - (DEFAULT_RANGE_DAYS - 1) * MS_PER_DAY);

  if (startDate.getTime() > endDate.getTime()) {
    throw new AppError(
      "startDate must be before or equal to endDate",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  return { startDate, endDate };
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate()
    )
  );
}

function startOfUtcWeek(value: Date): Date {
  const dayStart = startOfUtcDay(value);
  const day = dayStart.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  return new Date(dayStart.getTime() - daysSinceMonday * MS_PER_DAY);
}

function startOfUtcMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addUtcMonths(value: Date, months: number): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1)
  );
}

function startOfGroup(value: Date, groupBy: TrendGroup): Date {
  if (groupBy === "DAILY") return startOfUtcDay(value);
  if (groupBy === "WEEKLY") return startOfUtcWeek(value);
  return startOfUtcMonth(value);
}

function nextGroupStart(value: Date, groupBy: TrendGroup): Date {
  if (groupBy === "DAILY") return new Date(value.getTime() + MS_PER_DAY);
  if (groupBy === "WEEKLY") return new Date(value.getTime() + 7 * MS_PER_DAY);
  return addUtcMonths(value, 1);
}

/**
 * Builds deterministic UTC-aligned trend periods. The first and last periods
 * are clipped to the requested date range so every returned count is scoped to
 * exactly what the caller asked for.
 */
export function buildTrendPeriods(
  startDate: Date,
  endDate: Date,
  groupBy: TrendGroup
): TrendPeriod[] {
  if (startDate.getTime() > endDate.getTime()) {
    throw new AppError(
      "startDate must be before or equal to endDate",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const periods: TrendPeriod[] = [];
  const endMs = endDate.getTime();
  let cursor = startOfGroup(startDate, groupBy);

  // Bounded loop protects against pathological inputs.
  for (let index = 0; index < 10_000; index += 1) {
    if (cursor.getTime() > endMs) break;

    const next = nextGroupStart(cursor, groupBy);
    const periodStart =
      cursor.getTime() < startDate.getTime() ? startDate : cursor;
    const periodEnd = new Date(
      Math.min(next.getTime() - 1, endMs)
    );

    if (periodEnd.getTime() >= periodStart.getTime()) {
      periods.push({ periodStart, periodEnd });
    }

    cursor = next;
  }

  return periods;
}

function emptyCounts(statuses: readonly string[]): Record<string, number> {
  return Object.fromEntries(statuses.map((status) => [status, 0]));
}

function statusAtPeriods(
  entity: TrendEntity,
  history: StatusHistoryRow[],
  periods: TrendPeriod[],
  statuses: readonly string[]
): TrendPeriodResult[] {
  const results: TrendPeriodResult[] = [];
  const entityCreatedAt = entity.createdAt.getTime();
  const entityDeletedAt = entity.deletedAt?.getTime() ?? null;

  let historyIndex = 0;
  let currentStatus: string | null = null;

  if (history.length === 0) {
    // No recorded transition means the current status has been constant since
    // creation for records written by this application.
    currentStatus = entity.status;
  } else if (history[0].previousStatus) {
    // The first transition's previousStatus is the status before the first
    // recorded change.
    currentStatus = history[0].previousStatus;
  } else if (
    history[0].changedAt.getTime() <=
    entity.createdAt.getTime() + 1_000
  ) {
    // A null previousStatus is a reliable baseline only when the row was
    // written at creation time. Otherwise the pre-history status is unknown.
    currentStatus = history[0].status;
  }

  for (const period of periods) {
    while (
      historyIndex < history.length &&
      history[historyIndex].changedAt.getTime() <=
        period.periodEnd.getTime()
    ) {
      currentStatus = history[historyIndex].status;
      historyIndex += 1;
    }

    const counts = emptyCounts(statuses);
    let unknown = 0;

    // A period boundary is the period end. An entity is counted only while it
    // has been created, has not been deleted, and its status is reliable.
    const boundary = period.periodEnd.getTime();
    const existsAtBoundary =
      boundary >= entityCreatedAt &&
      (entityDeletedAt === null || boundary < entityDeletedAt);

    if (existsAtBoundary && currentStatus) {
      counts[currentStatus] = 1;
    } else if (existsAtBoundary) {
      unknown = 1;
    }

    results.push({
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
      unknown,
    });
  }

  return results;
}

function combinePeriods(
  periodSets: TrendPeriodResult[][],
  periods: TrendPeriod[],
  statuses: readonly string[]
): TrendPeriodResult[] {
  return periods.map((period, index) => {
    const counts = emptyCounts(statuses);
    let unknown = 0;

    for (const set of periodSets) {
      const entry = set[index];
      for (const [status, value] of Object.entries(entry.counts)) {
        counts[status] = (counts[status] ?? 0) + value;
      }
      unknown += entry.unknown;
    }

    return {
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
      unknown,
    };
  });
}

function groupHistory(rows: StatusHistoryRow[]) {
  const byEntity = new Map<string, StatusHistoryRow[]>();
  for (const row of rows) {
    const key = (row as StatusHistoryRow & { vehicleId?: string; riderId?: string })
      .vehicleId ??
      (row as StatusHistoryRow & { riderId?: string }).riderId;
    if (!key) continue;
    const list = byEntity.get(key) ?? [];
    list.push(row);
    byEntity.set(key, list);
  }
  return byEntity;
}

export async function getVehicleTrends(
  query: TrendsQuery
): Promise<StatusTrendResult> {
  const { startDate, endDate } = resolveTrendRange(query);
  const periods = buildTrendPeriods(startDate, endDate, query.groupBy);

  const entities = await prisma.vehicle.findMany({
    where: {
      createdAt: { lte: endDate },
      OR: [
        { deletedAt: null },
        { deletedAt: { gt: startDate } },
      ],
    },
    select: { id: true, status: true, createdAt: true, deletedAt: true },
  });

  const entityIds = entities.map((entity) => entity.id);
  const history = entityIds.length
    ? await prisma.vehicleStatusHistory.findMany({
        where: {
          vehicleId: { in: entityIds },
          changedAt: { lte: endDate },
        },
        select: {
          id: true,
          vehicleId: true,
          status: true,
          previousStatus: true,
          changedAt: true,
        },
        orderBy: [{ changedAt: "asc" }, { id: "asc" }],
      })
    : [];

  const historyByEntity = groupHistory(
    history as unknown as StatusHistoryRow[]
  );
  const periodSets = entities.map((entity) =>
    statusAtPeriods(
      entity,
      historyByEntity.get(entity.id) ?? [],
      periods,
      VEHICLE_TREND_STATUSES
    )
  );

  return {
    groupBy: query.groupBy,
    timezone: "UTC",
    startDate,
    endDate,
    statuses: VEHICLE_TREND_STATUSES,
    periods: combinePeriods(
      periodSets,
      periods,
      VEHICLE_TREND_STATUSES
    ),
  };
}

export async function getRiderTrends(
  query: TrendsQuery
): Promise<StatusTrendResult> {
  const { startDate, endDate } = resolveTrendRange(query);
  const periods = buildTrendPeriods(startDate, endDate, query.groupBy);

  const entities = await prisma.rider.findMany({
    where: {
      createdAt: { lte: endDate },
      OR: [
        { deletedAt: null },
        { deletedAt: { gt: startDate } },
      ],
    },
    select: { id: true, status: true, createdAt: true, deletedAt: true },
  });

  const entityIds = entities.map((entity) => entity.id);
  const history = entityIds.length
    ? await prisma.riderStatusHistory.findMany({
        where: {
          riderId: { in: entityIds },
          changedAt: { lte: endDate },
        },
        select: {
          id: true,
          riderId: true,
          status: true,
          previousStatus: true,
          changedAt: true,
        },
        orderBy: [{ changedAt: "asc" }, { id: "asc" }],
      })
    : [];

  const historyByEntity = groupHistory(
    history as unknown as StatusHistoryRow[]
  );
  const periodSets = entities.map((entity) =>
    statusAtPeriods(
      entity,
      historyByEntity.get(entity.id) ?? [],
      periods,
      RIDER_TREND_STATUSES
    )
  );

  return {
    groupBy: query.groupBy,
    timezone: "UTC",
    startDate,
    endDate,
    statuses: RIDER_TREND_STATUSES,
    periods: combinePeriods(periodSets, periods, RIDER_TREND_STATUSES),
  };
}

export async function getStatusTrends(query: TrendsQuery) {
  const [vehicle, rider] = await Promise.all([
    getVehicleTrends(query),
    getRiderTrends(query),
  ]);

  return { vehicle, rider };
}
