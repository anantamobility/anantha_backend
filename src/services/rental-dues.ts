import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../generated/prisma/client.js";
import { AppError, ErrorCode } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import {
  buildDuePeriods,
  calculateDueAmount,
  deriveDueStatus,
  toDecimal,
} from "./rental-schedule.js";

type Tx = Prisma.TransactionClient;

const TERMINAL_RENTAL_STATUSES = [
  "COMPLETED",
  "TERMINATED",
  "CANCELLED",
] as const;

const OPEN_DUE_STATUSES = ["PENDING", "PARTIALLY_PAID", "OVERDUE"] as const;

export const rentalDueSelect = {
  id: true,
  rentalId: true,
  periodStart: true,
  periodEnd: true,
  dueDate: true,
  amountDue: true,
  amountCollected: true,
  outstandingAmount: true,
  status: true,
  generatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function refreshOverdueDues(tx: Tx, rentalId?: string) {
  const now = new Date();
  return tx.rentalCollectionDue.updateMany({
    where: {
      ...(rentalId ? { rentalId } : {}),
      status: { in: ["PENDING", "PARTIALLY_PAID"] },
      dueDate: { lt: now },
      outstandingAmount: { gt: 0 },
    },
    data: { status: "OVERDUE" },
  });
}

export async function generateRentalDues(
  tx: Tx,
  input: {
    rentalId: string;
    throughDate: Date;
    actor?: AuditActor;
  }
) {
  const rental = await tx.rental.findUnique({
    where: { id: input.rentalId },
    select: {
      id: true,
      rentalNumber: true,
      status: true,
      startDate: true,
      endDate: true,
      collectionPeriod: true,
      currency: true,
      dailyRate: true,
      weeklyRate: true,
      fortnightlyRate: true,
      monthlyRate: true,
    },
  });

  if (!rental) {
    throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
  }

  if (
    TERMINAL_RENTAL_STATUSES.includes(
      rental.status as (typeof TERMINAL_RENTAL_STATUSES)[number]
    )
  ) {
    throw new AppError(
      `Collection dues cannot be generated for a ${rental.status} rental`,
      409,
      ErrorCode.CONFLICT
    );
  }

  if (input.throughDate.getTime() < rental.startDate.getTime()) {
    throw new AppError(
      "throughDate cannot be before the rental start date",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const periods = buildDuePeriods({
    startDate: rental.startDate,
    period: rental.collectionPeriod,
    throughDate: input.throughDate,
  });

  const existing = await tx.rentalCollectionDue.findMany({
    where: {
      rentalId: rental.id,
      OR: periods.map((period) => ({
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      })),
    },
    select: { periodStart: true, periodEnd: true },
  });

  const existingKeys = new Set(
    existing.map(
      (row) => `${row.periodStart.toISOString()}|${row.periodEnd.toISOString()}`
    )
  );

  const now = new Date();
  let generated = 0;

  for (const period of periods) {
    const key = `${period.periodStart.toISOString()}|${period.periodEnd.toISOString()}`;
    const amountDue = calculateDueAmount({
      period: rental.collectionPeriod,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      rates: {
        dailyRate: rental.dailyRate,
        weeklyRate: rental.weeklyRate,
        fortnightlyRate: rental.fortnightlyRate,
        monthlyRate: rental.monthlyRate,
      },
    });

    const due = await tx.rentalCollectionDue.upsert({
      where: {
        rentalId_periodStart_periodEnd: {
          rentalId: rental.id,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd,
        },
      },
      create: {
        rentalId: rental.id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        dueDate: period.periodStart,
        amountDue,
        amountCollected: new Prisma.Decimal(0),
        outstandingAmount: amountDue,
        status: deriveDueStatus({
          amountCollected: new Prisma.Decimal(0),
          outstandingAmount: amountDue,
          dueDate: period.periodStart,
          now,
        }),
      },
      update: {},
      select: { id: true },
    });

    if (!existingKeys.has(key)) generated += 1;

    await tx.rentalLedgerEntry.upsert({
      where: {
        idempotencyKey: `rental-due:${due.id}`,
      },
      create: {
        rentalId: rental.id,
        entryType: "RENT_CHARGED",
        direction: "DEBIT",
        amount: amountDue,
        currency: rental.currency,
        occurredAt: period.periodStart,
        description: `Rent charged for ${period.periodStart
          .toISOString()
          .slice(0, 10)} to ${period.periodEnd.toISOString().slice(0, 10)}`,
        sourceType: "RentalCollectionDue",
        sourceId: due.id,
        idempotencyKey: `rental-due:${due.id}`,
        createdById: input.actor?.userId ?? null,
      },
      update: {},
    });
  }

  await refreshOverdueDues(tx, rental.id);

  const dues = await tx.rentalCollectionDue.findMany({
    where: { rentalId: rental.id },
    select: rentalDueSelect,
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });

  if (input.actor) {
    await logAudit({
      ...input.actor,
      action: "GENERATE",
      resource: "RentalCollectionDue",
      resourceId: rental.id,
      newData: {
        rentalNumber: rental.rentalNumber,
        throughDate: input.throughDate,
        periodsProcessed: periods.length,
        generated,
      },
      summary: `${input.actor.userName} generated ${generated} collection due(s) for rental ${rental.rentalNumber}.`,
      db: tx,
      throwOnError: true,
    });
  }

  return {
    rentalId: rental.id,
    rentalNumber: rental.rentalNumber,
    collectionPeriod: rental.collectionPeriod,
    throughDate: input.throughDate,
    periodsProcessed: periods.length,
    generated,
    dues,
  };
}

export async function getRentalFinancialSummary(tx: Tx, rentalId: string) {
  const [dues, collections] = await Promise.all([
    tx.rentalCollectionDue.findMany({
      where: { rentalId },
      select: {
        amountDue: true,
        amountCollected: true,
        outstandingAmount: true,
        status: true,
      },
    }),
    tx.collection.findMany({
      where: { rentalId, status: "CLEARED" },
      select: { amount: true },
    }),
  ]);

  const summary = dues.reduce(
    (acc, due) => ({
      totalCharges: acc.totalCharges.add(toDecimal(due.amountDue)),
      totalCollectedOnDues: acc.totalCollectedOnDues.add(
        toDecimal(due.amountCollected)
      ),
      outstanding: acc.outstanding.add(toDecimal(due.outstandingAmount)),
    }),
    {
      totalCharges: new Prisma.Decimal(0),
      totalCollectedOnDues: new Prisma.Decimal(0),
      outstanding: new Prisma.Decimal(0),
    }
  );

  const confirmedCollections = collections.reduce(
    (total, collection) => total.add(toDecimal(collection.amount)),
    new Prisma.Decimal(0)
  );

  return {
    totalCharges: summary.totalCharges,
    totalCollectedOnDues: summary.totalCollectedOnDues,
    confirmedCollections,
    outstanding: summary.outstanding,
    dueCount: dues.length,
    openDueCount: dues.filter((due) => due.status !== "PAID").length,
  };
}

async function applyCreditToDues(
  tx: Tx,
  rentalId: string,
  amount: Prisma.Decimal
) {
  const dues = await tx.rentalCollectionDue.findMany({
    where: {
      rentalId,
      status: { in: [...OPEN_DUE_STATUSES] },
      outstandingAmount: { gt: 0 },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      amountDue: true,
      amountCollected: true,
      outstandingAmount: true,
      dueDate: true,
    },
  });

  const totalOutstanding = dues.reduce(
    (total, due) => total.add(toDecimal(due.outstandingAmount)),
    new Prisma.Decimal(0)
  );

  if (totalOutstanding.lt(amount)) {
    throw new AppError(
      "Adjustment exceeds the rental outstanding balance",
      409,
      ErrorCode.CONFLICT
    );
  }

  let remaining = amount;
  for (const due of dues) {
    if (remaining.lte(0)) break;

    const outstanding = toDecimal(due.outstandingAmount);
    const applied = Prisma.Decimal.min(outstanding, remaining);
    const nextOutstanding = outstanding.sub(applied);
    const nextAmountDue = toDecimal(due.amountDue).sub(applied);
    const amountCollected = toDecimal(due.amountCollected);

    const updated = await tx.rentalCollectionDue.updateMany({
      where: {
        id: due.id,
        outstandingAmount: { gte: applied },
      },
      data: {
        amountDue: nextAmountDue,
        outstandingAmount: nextOutstanding,
        status: deriveDueStatus({
          amountCollected,
          outstandingAmount: nextOutstanding,
          dueDate: due.dueDate,
        }),
      },
    });

    if (updated.count === 0) {
      throw new AppError(
        "Collection due was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }

    remaining = remaining.sub(applied);
  }

  return amount.sub(remaining);
}

async function applyDebitToDues(
  tx: Tx,
  rentalId: string,
  amount: Prisma.Decimal
) {
  const due = await tx.rentalCollectionDue.findFirst({
    where: { rentalId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      amountDue: true,
      amountCollected: true,
      outstandingAmount: true,
      dueDate: true,
    },
  });

  if (!due) {
    throw new AppError(
      "A debit rent adjustment requires at least one generated collection due",
      409,
      ErrorCode.CONFLICT
    );
  }

  const nextOutstanding = toDecimal(due.outstandingAmount).add(amount);
  const nextAmountDue = toDecimal(due.amountDue).add(amount);

  const updated = await tx.rentalCollectionDue.updateMany({
    where: { id: due.id },
    data: {
      amountDue: nextAmountDue,
      outstandingAmount: nextOutstanding,
      status: deriveDueStatus({
        amountCollected: toDecimal(due.amountCollected),
        outstandingAmount: nextOutstanding,
        dueDate: due.dueDate,
      }),
    },
  });

  if (updated.count === 0) {
    throw new AppError(
      "Collection due was modified concurrently; please retry",
      409,
      ErrorCode.CONFLICT
    );
  }

  return amount;
}

export async function recordRentAdjustment(
  tx: Tx,
  input: {
    rentalId: string;
    amount: Prisma.Decimal;
    direction: "CREDIT" | "DEBIT";
    reason: string;
    occurredAt?: Date;
    idempotencyKey?: string;
    actor: AuditActor;
  }
) {
  const rental = await tx.rental.findUnique({
    where: { id: input.rentalId },
    select: {
      id: true,
      rentalNumber: true,
      currency: true,
      status: true,
    },
  });

  if (!rental) {
    throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
  }

  const idempotencyKey =
    input.idempotencyKey ?? `rent-adjust:${input.rentalId}:${uuidv4()}`;

  const existing = await tx.rentalLedgerEntry.findUnique({
    where: { idempotencyKey },
  });

  if (existing) {
    return { entry: existing, applied: new Prisma.Decimal(0), duplicate: true };
  }

  const applied =
    input.direction === "CREDIT"
      ? await applyCreditToDues(tx, input.rentalId, input.amount)
      : await applyDebitToDues(tx, input.rentalId, input.amount);

  const entry = await tx.rentalLedgerEntry.create({
    data: {
      rentalId: input.rentalId,
      entryType: "RENT_ADJUSTMENT",
      direction: input.direction,
      amount: input.amount,
      currency: rental.currency,
      occurredAt: input.occurredAt ?? new Date(),
      description: input.reason,
      sourceType: "RentalAdjustment",
      sourceId: input.rentalId,
      idempotencyKey,
      createdById: input.actor.userId,
    },
  });

  await logAudit({
    ...input.actor,
    action: "ADJUST",
    resource: "Rental",
    resourceId: rental.id,
    newData: {
      rentalNumber: rental.rentalNumber,
      amount: input.amount,
      direction: input.direction,
      reason: input.reason,
    },
    summary: `${input.actor.userName} recorded a ${input.direction} rent adjustment on rental ${rental.rentalNumber}.`,
    db: tx,
    throwOnError: true,
  });

  return { entry, applied, duplicate: false };
}
