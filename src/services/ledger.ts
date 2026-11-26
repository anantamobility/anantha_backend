import { Prisma, type LedgerDirection, type LedgerEntryType } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import { AppError } from "../utils/errors.js";
import type { ListLedgerQuery } from "../validation/ledger.js";

type Tx = Prisma.TransactionClient;

export const ledgerEntrySelect = {
  id: true,
  riderId: true,
  entryType: true,
  direction: true,
  amount: true,
  occurredAt: true,
  description: true,
  sourceType: true,
  sourceId: true,
  payStatementId: true,
  rentalId: true,
  reversesEntryId: true,
  createdById: true,
  createdAt: true,
} as const;

export const ledgerEntryDetailSelect = {
  ...ledgerEntrySelect,
  rider: { select: { id: true, riderCode: true, fullName: true } },
  rental: { select: { id: true, rentalNumber: true, status: true } },
  payStatement: {
    select: { id: true, statementNumber: true, status: true },
  },
} as const;

export async function assertB2CRider(tx: Tx, riderId: string) {
  const rider = await tx.rider.findUnique({
    where: { id: riderId },
    select: {
      id: true,
      riderCode: true,
      fullName: true,
      status: true,
      rentalType: true,
      deletedAt: true,
      b2cMode: true
    }, 
  });

  if (!rider || rider.deletedAt) {
    throw new AppError("Rider not found", 404);
  }
  if (rider.rentalType !== "B2C" || rider.b2cMode !== "AML_RIDER") {
    throw new AppError("Rider ledger entries are only for B2C AML riders", 409);
  }

  return rider;
}

export async function assertRentalBelongsToRider(
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
      b2cMode: true
    },
  });

  if (!rental) {
    throw new AppError("Rental not found", 404);
  }
  if (rental.rentalType !== "B2C" || rental.riderId !== riderId || rental.b2cMode !== "AML_RIDER") {
    throw new AppError(
      "Rental is not an AML rider rental for this rider", 409
    );
  }

  return rental;
}

export type RecordLedgerEntryInput = {
  entryType: LedgerEntryType;
  direction: LedgerDirection;
  amount: Prisma.Decimal;
  description: string;
  occurredAt?: Date;
  rentalId?: string | null;
  riderId?: string | null;
  payStatementId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
};

/**
 * The single writer for ledger entries. Called by business flows inside their
 * own transaction. Never exposed as a route.
 * the only case where rider ledger entry happens is when rider is b2c aml rider
 */
export async function recordLedgerEntry(tx: Tx, input: RecordLedgerEntryInput, createdById: string | null) {
  if (input.amount.lte(0)) {
    throw new AppError("Ledger entry amount must be greater than 0", 400);
  }
  if (!input.rentalId && !input.riderId) {
    throw new AppError("Ledger entry needs a rental or a rider party", 400);
  }
  if (input.riderId) {
    await assertB2CRider(tx, input.riderId);
    if (input.rentalId) {
      await assertRentalBelongsToRider(tx, input.rentalId, input.riderId);
    }
  }

  return tx.ledgerEntry.create({
    data: {
      entryType: input.entryType,
      direction: input.direction,
      amount: input.amount,
      occurredAt: input.occurredAt ?? new Date(),
      description: input.description,
      rentalId: input.rentalId ?? null,
      riderId: input.riderId ?? null,
      payStatementId: input.payStatementId ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      createdById,
    },
    select: ledgerEntryDetailSelect,
  });
}

export async function listLedgerEntries(query: ListLedgerQuery) {
  const { page, limit, search } = query;
  const where: Prisma.LedgerEntryWhereInput = {};

  if (query.riderId) where.riderId = query.riderId;
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
      select: ledgerEntryDetailSelect,
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


