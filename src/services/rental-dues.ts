import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import { AppError } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import {
  buildDuePeriods,
  calculateDueAmount,
  deriveDueStatus,
  toDecimal,
} from "./rental-schedule.js";
import { recordLedgerEntry } from "./ledger.js";
import type {
  GenerateDuesInput,
  ListRentalDuesQuery,
} from "../validation/collection.js";

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

export async function generateRentalDues(
  tx: Tx,
  input: {
    rentalId: string;
    throughDate: Date;
    includePartial?: boolean;
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
      dailyRate: true,
      weeklyRate: true,
      fortnightlyRate: true,
      monthlyRate: true,
    },
  });

  if (!rental) {
    throw new AppError("Rental not found", 404);
  }

  if (
    TERMINAL_RENTAL_STATUSES.includes(
      rental.status as (typeof TERMINAL_RENTAL_STATUSES)[number]
    )
  ) {
    throw new AppError(
      `Collection dues cannot be generated for a ${rental.status} rental`,
      409
    );
  }

  if (input.throughDate.getTime() < rental.startDate.getTime()) {
    throw new AppError(
      "throughDate cannot be before the rental start date",
      400
    );
  }

  const periods = buildDuePeriods({
    startDate: rental.startDate,
    period: rental.collectionPeriod,
    throughDate: input.throughDate,
    includePartial: input.includePartial,
  });

  const existing = await tx.rentalDue.findMany({
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

    const due = await tx.rentalDue.upsert({
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
        dueDate: period.periodEnd,
        amountDue,
        amountCollected: new Prisma.Decimal(0),
        outstandingAmount: amountDue,
        status: deriveDueStatus({
          amountCollected: new Prisma.Decimal(0),
          outstandingAmount: amountDue,
          dueDate: period.periodEnd,
          now,
        }),
      },
      update: {},
      select: { id: true },
    });

    if (!existingKeys.has(key)) {
      generated += 1;

      await recordLedgerEntry(
        tx,
        {
          rentalId: rental.id,
          entryType: "RENT_CHARGED",
          direction: "DEBIT",
          amount: amountDue,
          occurredAt: period.periodStart,
          description: `Rent charged for ${period.periodStart
            .toISOString()
            .slice(0, 10)} to ${period.periodEnd.toISOString().slice(0, 10)}`,
          sourceType: "RentalDue",
          sourceId: due.id,
        },
        input.actor?.userId ?? null
      );
    }
  }

  const dues = await tx.rentalDue.findMany({
    where: { rentalId: rental.id },
    select: rentalDueSelect,
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
  });

  if (input.actor) {
    await logAudit({
      ...input.actor,
      action: "GENERATE",
      resource: "RentalDue",
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

async function assertRentalExists(rentalId: string) {
  const rental = await prisma.rental.findUnique({
    where: { id: rentalId },
    select: { id: true, rentalNumber: true, status: true },
  });
  if (!rental) {
    throw new AppError("Rental not found", 404);
  }
  return rental;
}

export async function listRentalDues(
  rentalId: string,
  query: ListRentalDuesQuery
) {
  await assertRentalExists(rentalId);
  const { page, limit } = query;

  const where: Prisma.RentalDueWhereInput = { rentalId };
  if (query.status) where.status = query.status;

  const orderBy: Prisma.RentalDueOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [dues, total] = await Promise.all([
    prisma.rentalDue.findMany({
      where,
      select: rentalDueSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.rentalDue.count({ where }),
  ]);

  return {
    dues,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function generateDues(
  rentalId: string,
  input: GenerateDuesInput,
  actor: AuditActor
) {
  const throughDate = input.throughDate ?? new Date();

  try {
    return await prisma.$transaction(async (tx) =>
      generateRentalDues(tx, {
        rentalId,
        throughDate,
        actor,
      })
    );
  } catch (err) {
    throw AppError.fromPrisma(err, "Collection dues could not be generated") ?? err;
  }
}

export async function getRentalFinancialSummary(tx: Tx, rentalId: string) {
  const [dues, collections] = await Promise.all([
    tx.rentalDue.findMany({
      where: { rentalId },
      select: {
        amountDue: true,
        amountCollected: true,
        outstandingAmount: true,
        status: true,
      },
    }),
    tx.collection.findMany({
      where: { rentalDue: { rentalId } },
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

