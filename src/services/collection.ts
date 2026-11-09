import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { deriveDueStatus, toDecimal } from "./rental-schedule.js";
import {
  generateRentalDues,
  getRentalFinancialSummary,
  refreshOverdueDues,
  rentalDueSelect,
} from "./rental-dues.js";
import type {
  ClearCollectionInput,
  CreateCollectionInput,
  GenerateDuesInput,
  ListCollectionsQuery,
  ListRentalCollectionsQuery,
  ListRentalDuesQuery,
} from "../validation/collection.js";

type Tx = Prisma.TransactionClient;

const COLLECTIBLE_RENTAL_STATUSES = ["ACTIVE", "ON_HOLD"] as const;
const OPEN_DUE_STATUSES = ["PENDING", "PARTIALLY_PAID", "OVERDUE"] as const;

export const collectionSelect = {
  id: true,
  payerType: true,
  clientId: true,
  riderId: true,
  rentalId: true,
  rentalDueId: true,
  amount: true,
  currency: true,
  paymentMethod: true,
  referenceNumber: true,
  receivedAt: true,
  status: true,
  receivedById: true,
  reconciledAt: true,
  reconciledById: true,
  idempotencyKey: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  rental: { select: { id: true, rentalNumber: true, status: true } },
} as const;

export const collectionDetailSelect = {
  ...collectionSelect,
  client: { select: { id: true, clientCode: true, name: true } },
  rider: { select: { id: true, riderCode: true, fullName: true } },
  receivedBy: { select: { id: true, name: true } },
  rentalDue: { select: rentalDueSelect },
} as const;

export async function allocateToDues(
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
      amountCollected: true,
      outstandingAmount: true,
      dueDate: true,
    },
  });

  const totalOutstanding = dues.reduce(
    (total, due) => total.add(toDecimal(due.outstandingAmount)),
    new Prisma.Decimal(0)
  );

  if (totalOutstanding.lte(0)) {
    throw new AppError(
      "Rental has no outstanding collection dues",
      409,
      ErrorCode.CONFLICT
    );
  }

  if (amount.gt(totalOutstanding)) {
    throw new AppError(
      "Collection amount exceeds the rental outstanding balance",
      409,
      ErrorCode.CONFLICT
    );
  }

  let remaining = amount;
  const allocations: { dueId: string; amount: Prisma.Decimal }[] = [];

  for (const due of dues) {
    if (remaining.lte(0)) break;

    const outstanding = toDecimal(due.outstandingAmount);
    const applied = Prisma.Decimal.min(outstanding, remaining);
    const nextOutstanding = outstanding.sub(applied);
    const nextCollected = toDecimal(due.amountCollected).add(applied);

    const updated = await tx.rentalCollectionDue.updateMany({
      where: {
        id: due.id,
        outstandingAmount: { gte: applied },
      },
      data: {
        amountCollected: { increment: applied },
        outstandingAmount: { decrement: applied },
        status: deriveDueStatus({
          amountCollected: nextCollected,
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

    allocations.push({ dueId: due.id, amount: applied });
    remaining = remaining.sub(applied);
  }

  return {
    allocations,
    primaryDueId: allocations[0]?.dueId ?? null,
    outstandingBefore: totalOutstanding,
    outstandingAfter: totalOutstanding.sub(amount),
  };
}

export async function createCollectionLedgerEntry(
  tx: Tx,
  input: {
    rentalId: string;
    collectionId: string;
    amount: Prisma.Decimal;
    currency: string;
    occurredAt: Date;
    actor: AuditActor;
    description: string;
  }
) {
  await tx.rentalLedgerEntry.upsert({
    where: { idempotencyKey: `collection:${input.collectionId}` },
    create: {
      rentalId: input.rentalId,
      entryType: "COLLECTION_RECEIVED",
      direction: "CREDIT",
      amount: input.amount,
      currency: input.currency,
      occurredAt: input.occurredAt,
      description: input.description,
      sourceType: "Collection",
      sourceId: input.collectionId,
      idempotencyKey: `collection:${input.collectionId}`,
      createdById: input.actor.userId,
    },
    update: {},
  });
}

async function assertEligibleRental(tx: Tx, rentalId: string) {
  const rental = await tx.rental.findUnique({
    where: { id: rentalId },
    select: {
      id: true,
      rentalNumber: true,
      rentalType: true,
      clientId: true,
      riderId: true,
      status: true,
      currency: true,
      startDate: true,
    },
  });

  if (!rental) {
    throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
  }

  if (
    !COLLECTIBLE_RENTAL_STATUSES.includes(
      rental.status as (typeof COLLECTIBLE_RENTAL_STATUSES)[number]
    )
  ) {
    throw new AppError(
      `Collections can only be recorded against an ACTIVE or ON_HOLD rental (current status: ${rental.status})`,
      409,
      ErrorCode.CONFLICT
    );
  }

  return rental;
}

export async function createCollection(
  input: CreateCollectionInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rental = await assertEligibleRental(tx, input.rentalId);
      const amount = new Prisma.Decimal(input.amount);
      const status = input.status ?? "CLEARED";
      const receivedAt = input.receivedAt ?? new Date();
      const idempotencyKey =
        input.idempotencyKey ??
        (input.referenceNumber
          ? `collection:${input.rentalId}:${input.referenceNumber}`
          : `collection:${input.rentalId}:${uuidv4()}`);

      const existing = await tx.collection.findUnique({
        where: { idempotencyKey },
        select: collectionDetailSelect,
      });

      if (existing) {
        const summary = await getRentalFinancialSummary(tx, input.rentalId);
        return { collection: existing, summary, allocations: [], duplicate: true };
      }

      let allocation: Awaited<ReturnType<typeof allocateToDues>> | null = null;

      if (status === "CLEARED") {
        await refreshOverdueDues(tx, input.rentalId);
        allocation = await allocateToDues(tx, input.rentalId, amount);
      }

      const isRiderPayer = rental.rentalType === "B2C";

      const collection = await tx.collection.create({
        data: {
          payerType: isRiderPayer ? "RIDER" : "CLIENT",
          clientId: isRiderPayer ? null : rental.clientId,
          riderId: isRiderPayer ? rental.riderId : null,
          rentalId: rental.id,
          rentalDueId: allocation?.primaryDueId ?? null,
          amount,
          currency: rental.currency,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          receivedAt,
          status,
          receivedById: actor.userId,
          reconciledAt: status === "CLEARED" ? receivedAt : null,
          reconciledById: status === "CLEARED" ? actor.userId : null,
          idempotencyKey,
          notes: input.notes ?? null,
        },
        select: collectionDetailSelect,
      });

      if (status === "CLEARED") {
        await createCollectionLedgerEntry(tx, {
          rentalId: rental.id,
          collectionId: collection.id,
          amount,
          currency: rental.currency,
          occurredAt: receivedAt,
          actor,
          description: input.notes
            ? `Collection received: ${input.notes}`
            : `Collection received for rental ${rental.rentalNumber}`,
        });
      }

      const summary = await getRentalFinancialSummary(tx, rental.id);

      await logAudit({
        ...actor,
        action: "COLLECTION_RECEIVED",
        resource: "Collection",
        resourceId: collection.id,
        newData: {
          rentalId: rental.id,
          rentalNumber: rental.rentalNumber,
          amount,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          status,
          allocations: allocation?.allocations ?? [],
        },
        summary: `${actor.userName} recorded a ${status.toLowerCase()} collection of ${amount} for rental ${rental.rentalNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return {
        collection,
        summary,
        allocations: allocation?.allocations ?? [],
        outstandingBefore: allocation?.outstandingBefore ?? null,
        outstandingAfter: allocation?.outstandingAfter ?? null,
        duplicate: false,
      };
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A collection with this reference or idempotency key already exists"
    );
  }
}

export async function clearCollection(
  id: string,
  input: ClearCollectionInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const collection = await tx.collection.findUnique({
        where: { id },
        select: {
          id: true,
          rentalId: true,
          amount: true,
          currency: true,
          status: true,
          referenceNumber: true,
          notes: true,
        },
      });

      if (!collection) {
        throw new AppError("Collection not found", 404, ErrorCode.NOT_FOUND);
      }

      if (!collection.rentalId) {
        throw new AppError(
          "Collection is not linked to a rental",
          409,
          ErrorCode.CONFLICT
        );
      }

      if (collection.status === "CLEARED") {
        throw new AppError(
          "Collection is already cleared",
          409,
          ErrorCode.CONFLICT
        );
      }

      const rental = await assertEligibleRental(tx, collection.rentalId);
      await refreshOverdueDues(tx, rental.id);
      const allocation = await allocateToDues(
        tx,
        rental.id,
        toDecimal(collection.amount)
      );

      const reconciledAt = input.reconciledAt ?? new Date();
      const updated = await tx.collection.update({
        where: { id },
        data: {
          status: "CLEARED",
          rentalDueId: allocation.primaryDueId,
          reconciledAt,
          reconciledById: actor.userId,
        },
        select: collectionDetailSelect,
      });

      await createCollectionLedgerEntry(tx, {
        rentalId: rental.id,
        collectionId: collection.id,
        amount: toDecimal(collection.amount),
        currency: collection.currency,
        occurredAt: reconciledAt,
        actor,
        description: collection.notes
          ? `Collection cleared: ${collection.notes}`
          : `Collection cleared for rental ${rental.rentalNumber}`,
      });

      const summary = await getRentalFinancialSummary(tx, rental.id);

      await logAudit({
        ...actor,
        action: "COLLECTION_CLEARED",
        resource: "Collection",
        resourceId: collection.id,
        oldData: { status: collection.status },
        newData: {
          status: "CLEARED",
          rentalId: rental.id,
          allocations: allocation.allocations,
        },
        summary: `${actor.userName} cleared collection ${collection.id} for rental ${rental.rentalNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return {
        collection: updated,
        summary,
        allocations: allocation.allocations,
      };
    });
  } catch (err) {
    rethrowPrismaError(err, "Collection could not be cleared");
  }
}

export async function listCollections(query: ListCollectionsQuery) {
  const { page, limit, search } = query;

  const where: Prisma.CollectionWhereInput = {};
  if (query.rentalId) where.rentalId = query.rentalId;
  if (query.clientId) where.clientId = query.clientId;
  if (query.riderId) where.riderId = query.riderId;
  if (query.status) where.status = query.status;
  if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
  if (query.from || query.to) {
    where.receivedAt = {};
    if (query.from) where.receivedAt.gte = query.from;
    if (query.to) where.receivedAt.lte = query.to;
  }
  if (search) {
    where.OR = [
      { referenceNumber: { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
      { idempotencyKey: { contains: search, mode: "insensitive" } },
      { rental: { rentalNumber: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.CollectionOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [collections, total] = await Promise.all([
    prisma.collection.findMany({
      where,
      select: collectionSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.collection.count({ where }),
  ]);

  return {
    collections,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCollectionById(id: string) {
  const collection = await prisma.collection.findUnique({
    where: { id },
    select: collectionDetailSelect,
  });

  if (!collection) {
    throw new AppError("Collection not found", 404, ErrorCode.NOT_FOUND);
  }

  return collection;
}

async function assertRentalExists(rentalId: string) {
  const rental = await prisma.rental.findUnique({
    where: { id: rentalId },
    select: { id: true, rentalNumber: true, status: true },
  });
  if (!rental) {
    throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
  }
  return rental;
}

export async function listRentalCollections(
  rentalId: string,
  query: ListRentalCollectionsQuery
) {
  const rental = await assertRentalExists(rentalId);
  const { page, limit } = query;

  const where: Prisma.CollectionWhereInput = { rentalId };
  if (query.status) where.status = query.status;

  const orderBy: Prisma.CollectionOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [collections, total, summary] = await Promise.all([
    prisma.collection.findMany({
      where,
      select: collectionSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.collection.count({ where }),
    prisma.$transaction(async (tx) => getRentalFinancialSummary(tx, rentalId)),
  ]);

  return {
    rental,
    collections,
    summary,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function listRentalDues(
  rentalId: string,
  query: ListRentalDuesQuery
) {
  const rental = await assertRentalExists(rentalId);
  const { page, limit } = query;

  await prisma.$transaction(async (tx) => {
    await refreshOverdueDues(tx, rentalId);
  });

  const where: Prisma.RentalCollectionDueWhereInput = { rentalId };
  if (query.status) where.status = query.status;

  const orderBy: Prisma.RentalCollectionDueOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [dues, total, summary] = await Promise.all([
    prisma.rentalCollectionDue.findMany({
      where,
      select: rentalDueSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.rentalCollectionDue.count({ where }),
    prisma.$transaction(async (tx) => getRentalFinancialSummary(tx, rentalId)),
  ]);

  return {
    rental,
    dues,
    summary,
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
  try {
    return await prisma.$transaction(async (tx) =>
      generateRentalDues(tx, {
        rentalId,
        throughDate: input.throughDate ?? new Date(),
        actor,
      })
    );
  } catch (err) {
    rethrowPrismaError(err, "Collection dues could not be generated");
  }
}
