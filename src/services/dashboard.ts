import prisma from "../database/prismaClient.js";
import { Prisma } from "../generated/prisma/client.js";
import { toDecimal } from "./rental-schedule.js";
import { getStatusTrends, resolveTrendRange } from "./trends.js";
import type { DashboardQuery } from "../validation/dashboard.js";

const VEHICLE_STATUSES = [
  "IDLE",
  "DEPLOYED",
  "IN_SERVICE",
  "UNDER_REPAIR",
  "OUT_OF_SERVICE",
  "RETIRED",
] as const;

const RIDER_STATUSES = [
  "ONBOARDING",
  "ACTIVE",
  "SUSPENDED",
  "INACTIVE",
  "TERMINATED",
] as const;

const COLLECTION_STATUSES = [
  "PENDING",
  "CLEARED",
  "FAILED",
  "REFUNDED",
  "REVERSED",
] as const;

const DUE_STATUSES = ["PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE"] as const;
const OPEN_DUE_STATUSES = ["PENDING", "PARTIALLY_PAID", "OVERDUE"] as const;
const OPEN_DEPOSIT_STATUSES = [
  "REQUIRED",
  "PENDING_RECEIPT",
  "PARTIALLY_RECEIVED",
] as const;

const VERIFICATION_STATUSES = [
  "PENDING",
  "SUBMITTED",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
  "NOT_SUBMITTED",
  "UNDER_REVIEW",
] as const;

type CountGroup = { _count: { _all: number } };

function zeroMap(keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function addCounts(
  target: Record<string, number>,
  rows: Array<{ status: string } & CountGroup>
) {
  for (const row of rows) {
    target[row.status] = (target[row.status] ?? 0) + row._count._all;
  }
}

type DueAggregateRow = {
  status: string;
  _sum: {
    amountDue: Prisma.Decimal | null;
    amountCollected: Prisma.Decimal | null;
    outstandingAmount: Prisma.Decimal | null;
  };
  _count: { _all: number };
};

function summarizeDues(rows: DueAggregateRow[]) {
  const byStatus = Object.fromEntries(
    DUE_STATUSES.map((status) => [
      status,
      {
        count: 0,
        amountDue: new Prisma.Decimal(0),
        amountCollected: new Prisma.Decimal(0),
        outstandingAmount: new Prisma.Decimal(0),
      },
    ])
  );

  for (const row of rows) {
    const bucket = byStatus[row.status as (typeof DUE_STATUSES)[number]];
    if (!bucket) continue;
    bucket.count += row._count._all;
    bucket.amountDue = bucket.amountDue.add(toDecimal(row._sum.amountDue));
    bucket.amountCollected = bucket.amountCollected.add(
      toDecimal(row._sum.amountCollected)
    );
    bucket.outstandingAmount = bucket.outstandingAmount.add(
      toDecimal(row._sum.outstandingAmount)
    );
  }

  const totalDueAmount = Object.values(byStatus).reduce(
    (total, bucket) => total.add(bucket.amountDue),
    new Prisma.Decimal(0)
  );
  const totalCollectedOnDues = Object.values(byStatus).reduce(
    (total, bucket) => total.add(bucket.amountCollected),
    new Prisma.Decimal(0)
  );
  const totalOutstandingAmount = Object.values(byStatus).reduce(
    (total, bucket) => total.add(bucket.outstandingAmount),
    new Prisma.Decimal(0)
  );

  const pendingOutstandingAmount = OPEN_DUE_STATUSES.filter(
    (status) => status !== "OVERDUE"
  ).reduce(
    (total, status) =>
      total.add(byStatus[status]?.outstandingAmount ?? 0),
    new Prisma.Decimal(0)
  );

  return {
    byStatus,
    totalDueAmount,
    totalCollectedOnDues,
    totalOutstandingAmount,
    pendingOutstandingAmount,
    overdueOutstandingAmount:
      byStatus.OVERDUE?.outstandingAmount ?? new Prisma.Decimal(0),
    openDueCount: OPEN_DUE_STATUSES.reduce(
      (total, status) => total + (byStatus[status]?.count ?? 0),
      0
    ),
    overdueDueCount: byStatus.OVERDUE?.count ?? 0,
    totalDueCount: DUE_STATUSES.reduce(
      (total, status) => total + (byStatus[status]?.count ?? 0),
      0
    ),
  };
}

type CollectionAggregateRow = {
  status: string;
  payerType: string;
  _sum: { amount: Prisma.Decimal | null };
  _count: { _all: number };
};

function summarizeCollections(rows: CollectionAggregateRow[]) {
  const byStatus = Object.fromEntries(
    COLLECTION_STATUSES.map((status) => [
      status,
      { count: 0, amount: new Prisma.Decimal(0) },
    ])
  );

  for (const row of rows) {
    const bucket = byStatus[row.status as (typeof COLLECTION_STATUSES)[number]];
    if (!bucket) continue;
    bucket.count += row._count._all;
    bucket.amount = bucket.amount.add(toDecimal(row._sum.amount));
  }

  const totalAmount = Object.values(byStatus).reduce(
    (total, bucket) => total.add(bucket.amount),
    new Prisma.Decimal(0)
  );

  return {
    byStatus,
    totalCount: COLLECTION_STATUSES.reduce(
      (total, status) => total + (byStatus[status]?.count ?? 0),
      0
    ),
    totalAmount,
    collectedAmount: byStatus.CLEARED?.amount ?? new Prisma.Decimal(0),
    pendingCollectionAmount: byStatus.PENDING?.amount ?? new Prisma.Decimal(0),
    failedAmount: byStatus.FAILED?.amount ?? new Prisma.Decimal(0),
    refundedAmount: byStatus.REFUNDED?.amount ?? new Prisma.Decimal(0),
    reversedAmount: byStatus.REVERSED?.amount ?? new Prisma.Decimal(0),
  };
}

function summarizeCollectionsByPayer(
  rows: CollectionAggregateRow[],
  payerType: "RIDER" | "CLIENT"
) {
  return summarizeCollections(
    rows.filter((row) => row.payerType === payerType)
  );
}

type DepositRow = {
  id: string;
  payerType: string;
  status: string;
  amountRequired: Prisma.Decimal;
  transactions: Array<{
    type: string;
    direction: string;
    amount: Prisma.Decimal;
  }>;
};

function summarizeDeposits(deposits: DepositRow[]) {
  const byStatus = Object.fromEntries(
    [
      "REQUIRED",
      "PENDING_RECEIPT",
      "PARTIALLY_RECEIVED",
      "RECEIVED",
      "PARTIALLY_REFUNDED",
      "REFUNDED",
      "FORFEITED",
      "CLOSED",
    ].map((status) => [
      status,
      { count: 0, requiredAmount: new Prisma.Decimal(0) },
    ])
  );

  const byPayerType = {
    RIDER: {
      count: 0,
      requiredAmount: new Prisma.Decimal(0),
      receivedAmount: new Prisma.Decimal(0),
      outstandingAmount: new Prisma.Decimal(0),
    },
    CLIENT: {
      count: 0,
      requiredAmount: new Prisma.Decimal(0),
      receivedAmount: new Prisma.Decimal(0),
      outstandingAmount: new Prisma.Decimal(0),
    },
  };

  let totalRequiredAmount = new Prisma.Decimal(0);
  let totalReceivedAmount = new Prisma.Decimal(0);
  let totalRefundedAmount = new Prisma.Decimal(0);
  let totalDeductionAmount = new Prisma.Decimal(0);
  let outstandingDepositAmount = new Prisma.Decimal(0);
  let openDeposits = 0;

  for (const deposit of deposits) {
    const required = toDecimal(deposit.amountRequired);
    const credits = deposit.transactions
      .filter((transaction) => transaction.direction === "CREDIT")
      .reduce(
        (total, transaction) => total.add(toDecimal(transaction.amount)),
        new Prisma.Decimal(0)
      );
    const refunds = deposit.transactions
      .filter(
        (transaction) =>
          transaction.direction === "DEBIT" && transaction.type === "REFUND"
      )
      .reduce(
        (total, transaction) => total.add(toDecimal(transaction.amount)),
        new Prisma.Decimal(0)
      );
    const deductions = deposit.transactions
      .filter(
        (transaction) =>
          transaction.direction === "DEBIT" &&
          transaction.type !== "REFUND"
      )
      .reduce(
        (total, transaction) => total.add(toDecimal(transaction.amount)),
        new Prisma.Decimal(0)
      );

    const isOpen = OPEN_DEPOSIT_STATUSES.includes(
      deposit.status as (typeof OPEN_DEPOSIT_STATUSES)[number]
    );
    const outstanding = isOpen
      ? required.sub(credits).gt(0)
        ? required.sub(credits)
        : new Prisma.Decimal(0)
      : new Prisma.Decimal(0);

    if (isOpen) openDeposits += 1;

    totalRequiredAmount = totalRequiredAmount.add(required);
    totalReceivedAmount = totalReceivedAmount.add(credits);
    totalRefundedAmount = totalRefundedAmount.add(refunds);
    totalDeductionAmount = totalDeductionAmount.add(deductions);
    outstandingDepositAmount = outstandingDepositAmount.add(outstanding);

    const statusBucket =
      byStatus[deposit.status as keyof typeof byStatus] ?? null;
    if (statusBucket) {
      statusBucket.count += 1;
      statusBucket.requiredAmount = statusBucket.requiredAmount.add(required);
    }

    const payerBucket =
      deposit.payerType === "CLIENT"
        ? byPayerType.CLIENT
        : byPayerType.RIDER;
    payerBucket.count += 1;
    payerBucket.requiredAmount = payerBucket.requiredAmount.add(required);
    payerBucket.receivedAmount = payerBucket.receivedAmount.add(credits);
    payerBucket.outstandingAmount =
      payerBucket.outstandingAmount.add(outstanding);
  }

  return {
    totalDeposits: deposits.length,
    openDeposits,
    refundedDeposits: byStatus.REFUNDED?.count ?? 0,
    partiallyRefundedDeposits: byStatus.PARTIALLY_REFUNDED?.count ?? 0,
    closedDeposits: byStatus.CLOSED?.count ?? 0,
    forfeitedDeposits: byStatus.FORFEITED?.count ?? 0,
    totalRequiredAmount,
    totalReceivedAmount,
    totalRefundedAmount,
    totalDeductionAmount,
    outstandingDepositAmount,
    byStatus,
    byPayerType,
  };
}

export async function getDashboard(query: DashboardQuery) {
  const { startDate, endDate } = resolveTrendRange(query);
  const dateFilter = { gte: startDate, lte: endDate };
  const trendQuery = { ...query, startDate, endDate };

  const [
    vehicleGroups,
    riderGroups,
    verificationGroups,
    collectionGroups,
    b2cDueGroups,
    b2bDueGroups,
    deposits,
    trends,
  ] = await Promise.all([
    prisma.vehicle.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.rider.groupBy({
      by: ["status"],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.riderVerification.groupBy({
      by: ["type", "status"],
      where: { rider: { deletedAt: null } },
      _count: { _all: true },
    }),
    prisma.collection.groupBy({
      by: ["status", "payerType"],
      where: { receivedAt: dateFilter },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.rentalCollectionDue.groupBy({
      by: ["status"],
      where: {
        dueDate: dateFilter,
        rental: { rentalType: "B2C" },
      },
      _sum: {
        amountDue: true,
        amountCollected: true,
        outstandingAmount: true,
      },
      _count: { _all: true },
    }),
    prisma.rentalCollectionDue.groupBy({
      by: ["status"],
      where: {
        dueDate: dateFilter,
        rental: { rentalType: "B2B" },
      },
      _sum: {
        amountDue: true,
        amountCollected: true,
        outstandingAmount: true,
      },
      _count: { _all: true },
    }),
    prisma.deposit.findMany({
      where: { createdAt: dateFilter },
      select: {
        id: true,
        payerType: true,
        status: true,
        amountRequired: true,
        transactions: {
          select: { type: true, direction: true, amount: true },
        },
      },
    }),
    getStatusTrends(trendQuery),
  ]);

  const vehicleByStatus = zeroMap(VEHICLE_STATUSES);
  addCounts(
    vehicleByStatus,
    vehicleGroups as Array<{ status: string } & CountGroup>
  );
  const riderByStatus = zeroMap(RIDER_STATUSES);
  addCounts(
    riderByStatus,
    riderGroups as Array<{ status: string } & CountGroup>
  );

  const verificationByType: Record<string, Record<string, number>> = {
    PVC: zeroMap(VERIFICATION_STATUSES),
    BGV: zeroMap(VERIFICATION_STATUSES),
  };

  for (const group of verificationGroups as Array<{
    type: string;
    status: string;
    _count: { _all: number };
  }>) {
    const bucket = verificationByType[group.type] ?? {};
    bucket[group.status] = (bucket[group.status] ?? 0) + group._count._all;
    verificationByType[group.type] = bucket;
  }

  const allDueRows = [
    ...(b2cDueGroups as DueAggregateRow[]),
    ...(b2bDueGroups as DueAggregateRow[]),
  ];
  const dues = summarizeDues(allDueRows);
  const b2cDues = summarizeDues(b2cDueGroups as DueAggregateRow[]);
  const b2bDues = summarizeDues(b2bDueGroups as DueAggregateRow[]);

  const collectionRows = collectionGroups as CollectionAggregateRow[];
  const collections = summarizeCollections(collectionRows);
  const b2cCollections = summarizeCollectionsByPayer(collectionRows, "RIDER");
  const b2bCollections = summarizeCollectionsByPayer(collectionRows, "CLIENT");

  return {
    generatedAt: new Date(),
    filters: {
      startDate,
      endDate,
      groupBy: query.groupBy,
      timezone: "UTC" as const,
    },
    live: {
      vehicles: {
        total: Object.values(vehicleByStatus).reduce(
          (sum, value) => sum + value,
          0
        ),
        byStatus: vehicleByStatus,
      },
      riders: {
        total: Object.values(riderByStatus).reduce(
          (sum, value) => sum + value,
          0
        ),
        byStatus: riderByStatus,
        verifications: {
          byType: verificationByType,
        },
      },
    },
    trends,
    collectionDue: {
      totalCollections: collections.totalCount,
      totalCollectedAmount: collections.collectedAmount,
      totalPendingAmount: dues.pendingOutstandingAmount,
      totalOverdueAmount: dues.overdueOutstandingAmount,
      collectionsDue: dues.openDueCount,
      overdueCollections: dues.overdueDueCount,
      collections,
      dues,
      b2c: {
        collections: b2cCollections,
        dues: b2cDues,
      },
      b2b: {
        collections: b2bCollections,
        dues: b2bDues,
      },
    },
    deposits: summarizeDeposits(deposits as DepositRow[]),
  };
}

export type DashboardResult = Awaited<ReturnType<typeof getDashboard>>;
