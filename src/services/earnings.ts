import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { toDecimal } from "./rental-schedule.js";
import type {
  AdjustEarningInput,
  EarningsSummaryQuery,
  ListEarningsQuery,
  RecordEarningInput,
} from "../validation/earnings.js";

type Tx = Prisma.TransactionClient;

export const earningSelect = {
  id: true,
  riderId: true,
  entryType: true,
  direction: true,
  amount: true,
  currency: true,
  occurredAt: true,
  description: true,
  sourceType: true,
  sourceId: true,
  payStatementId: true,
  rentalId: true,
  reversesEntryId: true,
  createdById: true,
  idempotencyKey: true,
  metadata: true,
  createdAt: true,
} as const;

export const earningDetailSelect = {
  ...earningSelect,
  rider: { select: { id: true, riderCode: true, fullName: true } },
  rental: { select: { id: true, rentalNumber: true, status: true } },
  payStatement: {
    select: { id: true, statementNumber: true, status: true },
  },
} as const;

async function assertEarningRider(tx: Tx, riderId: string) {
  const rider = await tx.rider.findUnique({
    where: { id: riderId },
    select: {
      id: true,
      riderCode: true,
      fullName: true,
      status: true,
      rentalType: true,
      deletedAt: true,
    },
  });

  if (!rider || rider.deletedAt) {
    throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
  }
  if (rider.rentalType && rider.rentalType !== "B2C") {
    throw new AppError(
      "Earnings can only be recorded for a B2C rider",
      409,
      ErrorCode.CONFLICT
    );
  }

  return rider;
}

async function assertRentalForRider(
  tx: Tx,
  rentalId: string,
  riderId: string
) {
  const rental = await tx.rental.findUnique({
    where: { id: rentalId },
    select: {
      id: true,
      rentalNumber: true,
      rentalType: true,
      riderId: true,
      currency: true,
    },
  });

  if (!rental) {
    throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
  }
  if (rental.rentalType !== "B2C" || rental.riderId !== riderId) {
    throw new AppError(
      "Rental does not belong to the selected B2C rider",
      409,
      ErrorCode.CONFLICT
    );
  }

  return rental;
}

export async function getAvailableEarningsBalance(tx: Tx, riderId: string) {
  const entries = await tx.ledgerEntry.findMany({
    where: { riderId, payStatementId: null },
    select: { direction: true, amount: true },
  });

  return entries.reduce(
    (total, entry) =>
      entry.direction === "CREDIT"
        ? total.add(toDecimal(entry.amount))
        : total.sub(toDecimal(entry.amount)),
    new Prisma.Decimal(0)
  );
}

export async function recordEarning(
  input: RecordEarningInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rider = await assertEarningRider(tx, input.riderId);
      let currency = "INR";

      if (input.rentalId) {
        const rental = await assertRentalForRider(
          tx,
          input.rentalId,
          input.riderId
        );
        currency = rental.currency;
      }

      const idempotencyKey =
        input.idempotencyKey ??
        (input.referenceNumber
          ? `earning:${input.riderId}:${input.referenceNumber}`
          : `earning:${input.riderId}:${uuidv4()}`);

      const existing = await tx.ledgerEntry.findUnique({
        where: { idempotencyKey },
        select: earningDetailSelect,
      });
      if (existing) {
        return { entry: existing, duplicate: true };
      }

      const amount = new Prisma.Decimal(input.amount);
      const occurredAt = input.occurredAt ?? new Date();

      const entry = await tx.ledgerEntry.create({
        data: {
          riderId: rider.id,
          entryType: "DELIVERY_EARNING",
          direction: "CREDIT",
          amount,
          currency,
          occurredAt,
          description:
            input.description ??
            `Delivery earning for rider ${rider.riderCode}`,
          sourceType: "DeliveryEarning",
          sourceId: input.referenceNumber ?? null,
          rentalId: input.rentalId ?? null,
          createdById: actor.userId,
          idempotencyKey,
          metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue,
        },
        select: earningDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "LedgerEntry",
        resourceId: entry.id,
        newData: {
          riderId: rider.id,
          riderCode: rider.riderCode,
          rentalId: input.rentalId ?? null,
          amount,
          occurredAt,
          referenceNumber: input.referenceNumber ?? null,
        },
        summary: `${actor.userName} recorded a delivery earning of ${amount} for rider ${rider.riderCode}.`,
        db: tx,
        throwOnError: true,
      });

      return { entry, duplicate: false };
    });
  } catch (err) {
    rethrowPrismaError(err, "An earning with this reference already exists");
  }
}

export async function adjustEarning(
  input: AdjustEarningInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rider = await assertEarningRider(tx, input.riderId);
      let currency = "INR";

      if (input.rentalId) {
        const rental = await assertRentalForRider(
          tx,
          input.rentalId,
          input.riderId
        );
        currency = rental.currency;
      }

      const amount = new Prisma.Decimal(input.amount);

      const idempotencyKey =
        input.idempotencyKey ??
        `earning-adjust:${input.riderId}:${uuidv4()}`;

      const existing = await tx.ledgerEntry.findUnique({
        where: { idempotencyKey },
        select: earningDetailSelect,
      });
      if (existing) {
        return { entry: existing, duplicate: true };
      }

      if (input.direction === "DEBIT") {
        const available = await getAvailableEarningsBalance(tx, rider.id);
        if (amount.gt(available)) {
          throw new AppError(
            "Earning adjustment exceeds the available balance",
            409,
            ErrorCode.CONFLICT
          );
        }
      }

      const entry = await tx.ledgerEntry.create({
        data: {
          riderId: rider.id,
          entryType: "ADJUSTMENT",
          direction: input.direction,
          amount,
          currency,
          occurredAt: input.occurredAt ?? new Date(),
          description: input.reason,
          sourceType: "EarningsAdjustment",
          sourceId: input.idempotencyKey ?? null,
          rentalId: input.rentalId ?? null,
          createdById: actor.userId,
          idempotencyKey,
          metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue,
        },
        select: earningDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "ADJUST",
        resource: "LedgerEntry",
        resourceId: entry.id,
        newData: {
          riderId: rider.id,
          riderCode: rider.riderCode,
          amount,
          direction: input.direction,
          reason: input.reason,
        },
        summary: `${actor.userName} recorded a ${input.direction} earning adjustment of ${amount} for rider ${rider.riderCode}.`,
        db: tx,
        throwOnError: true,
      });

      return { entry, duplicate: false };
    });
  } catch (err) {
    rethrowPrismaError(err, "An earning adjustment with this key already exists");
  }
}

export async function listEarnings(query: ListEarningsQuery) {
  const { page, limit, search } = query;
  // Earnings are the rider side of the shared ledger; never mix rental entries in.
  const where: Prisma.LedgerEntryWhereInput = { riderId: query.riderId ?? { not: null } };

  if (query.rentalId) where.rentalId = query.rentalId;
  if (query.payStatementId) where.payStatementId = query.payStatementId;
  if (query.entryType) where.entryType = query.entryType;
  if (query.direction) where.direction = query.direction;
  if (query.from || query.to) {
    where.occurredAt = {};
    if (query.from) where.occurredAt.gte = query.from;
    if (query.to) where.occurredAt.lte = query.to;
  }
  if (search) {
    where.OR = [
      { description: { contains: search, mode: "insensitive" } },
      { idempotencyKey: { contains: search, mode: "insensitive" } },
      { rider: { fullName: { contains: search, mode: "insensitive" } } },
      { rider: { riderCode: { contains: search, mode: "insensitive" } } },
      { rental: { rentalNumber: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.LedgerEntryOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [entries, total] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      select: earningDetailSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  return {
    entries,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getEarningsSummary(query: EarningsSummaryQuery) {
  const rider = await prisma.rider.findUnique({
    where: { id: query.riderId },
    select: {
      id: true,
      riderCode: true,
      fullName: true,
      rentalType: true,
      deletedAt: true,
    },
  });

  if (!rider || rider.deletedAt) {
    throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: { riderId: rider.id },
    select: {
      direction: true,
      amount: true,
      payStatementId: true,
      entryType: true,
    },
  });

  const totals = entries.reduce(
    (acc, entry) => {
      const amount = toDecimal(entry.amount);
      if (entry.direction === "CREDIT") acc.totalCredits = acc.totalCredits.add(amount);
      else acc.totalDebits = acc.totalDebits.add(amount);

      if (entry.payStatementId === null) {
        if (entry.direction === "CREDIT") {
          acc.availableBalance = acc.availableBalance.add(amount);
        } else {
          acc.availableBalance = acc.availableBalance.sub(amount);
        }
        acc.unsettledEntryCount += 1;
      } else if (entry.direction === "CREDIT") {
        acc.settledCredits = acc.settledCredits.add(amount);
      }

      return acc;
    },
    {
      totalCredits: new Prisma.Decimal(0),
      totalDebits: new Prisma.Decimal(0),
      settledCredits: new Prisma.Decimal(0),
      availableBalance: new Prisma.Decimal(0),
      unsettledEntryCount: 0,
    }
  );

  return {
    rider,
    currency: "INR",
    ...totals,
  };
}
