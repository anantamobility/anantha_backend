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

export const collectionSelect = {
  id: true,
  purpose: true,
  payerType: true,
  clientId: true,
  riderId: true,
  rentalDueId: true,
  amount: true,
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
  rentalDue: {
    select: { id: true, rentalId: true, periodStart: true, periodEnd: true },
  },
} as const;

export const collectionDetailSelect = {
  ...collectionSelect,
  client: { select: { id: true, clientCode: true, name: true } },
  rider: { select: { id: true, riderCode: true, fullName: true } },
  receivedBy: { select: { id: true, name: true } },
  rentalDue: { select: rentalDueSelect },
} as const;

export async function createCollectionLedgerEntry(
  tx: Tx,
  input: {
    rentalId: string;
    collectionId: string;
    amount: Prisma.Decimal;
    occurredAt: Date;
    actor: AuditActor;
    description: string;
  }
) {
  await tx.ledgerEntry.upsert({
    where: { idempotencyKey: `collection:${input.collectionId}` },
    create: {
      rentalId: input.rentalId,
      entryType: "COLLECTION_RECEIVED",
      direction: "CREDIT",
      amount: input.amount,
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

async function assertCollectibleDue(tx: Tx, rentalDueId: string) {
  const due = await tx.rentalDue.findUnique({
    where: { id: rentalDueId },
    select: {
      id: true,
      rentalId: true,
      amountDue: true,
      amountCollected: true,
      outstandingAmount: true,
      dueDate: true,
      rental: {
        select: {
          id: true,
          rentalNumber: true,
          rentalType: true,
          clientId: true,
          riderId: true,
          status: true,
        },
      },
    },
  });

  if (!due) {
    throw new AppError("Rental due not found", 404, ErrorCode.NOT_FOUND);
  }

  if (
    !COLLECTIBLE_RENTAL_STATUSES.includes(
      due.rental.status as (typeof COLLECTIBLE_RENTAL_STATUSES)[number]
    )
  ) {
    throw new AppError(
      `Collections can only be recorded against an ACTIVE or ON_HOLD rental (current status: ${due.rental.status})`,
      409,
      ErrorCode.CONFLICT
    );
  }

  return due;
}

async function applyCollectionToDue(
  tx: Tx,
  due: {
    id: string;
    amountCollected: Prisma.Decimal;
    outstandingAmount: Prisma.Decimal;
    dueDate: Date;
  },
  amount: Prisma.Decimal
) {
  const outstanding = toDecimal(due.outstandingAmount);
  if (amount.gt(outstanding)) {
    throw new AppError(
      "Collection amount exceeds the due outstanding balance",
      409,
      ErrorCode.CONFLICT
    );
  }

  const nextOutstanding = outstanding.sub(amount);
  const nextCollected = toDecimal(due.amountCollected).add(amount);

  const updated = await tx.rentalDue.updateMany({
    where: { id: due.id, outstandingAmount: { gte: amount } },
    data: {
      amountCollected: { increment: amount },
      outstandingAmount: { decrement: amount },
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

  return { outstandingBefore: outstanding, outstandingAfter: nextOutstanding };
}

export async function createCollection(
  input: CreateCollectionInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) =>
      createCollectionWithinTransaction(tx, input, actor)
    );
  } catch (err) {
    rethrowPrismaError(
      err,
      "A collection with this reference or idempotency key already exists"
    );
  }
}

export async function createCollectionWithinTransaction(
  tx: Tx,
  input: CreateCollectionInput,
  actor: AuditActor
) {
  const due = await assertCollectibleDue(tx, input.rentalDueId);
  const rental = due.rental;
  const amount = new Prisma.Decimal(input.amount);
  const status = input.status ?? "CLEARED";
  const receivedAt = input.receivedAt ?? new Date();
  const idempotencyKey =
    input.idempotencyKey ??
    (input.referenceNumber
      ? `collection:${due.id}:${input.referenceNumber}`
      : `collection:${due.id}:${uuidv4()}`);

  const existing = await tx.collection.findUnique({
    where: { idempotencyKey },
    select: collectionDetailSelect,
  });

  if (existing) {
    const summary = await getRentalFinancialSummary(tx, rental.id);
    return { collection: existing, summary, duplicate: true };
  }

  const applied =
    status === "CLEARED"
      ? await applyCollectionToDue(tx, due, amount)
      : null;

  const isRiderPayer = rental.rentalType === "B2C";

  const collection = await tx.collection.create({
    data: {
      purpose: "RENT",
      payerType: isRiderPayer ? "RIDER" : "CLIENT",
      clientId: isRiderPayer ? null : rental.clientId,
      riderId: isRiderPayer ? rental.riderId : null,
      rentalDueId: due.id,
      amount,
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
      rentalDueId: due.id,
      amount,
      paymentMethod: input.paymentMethod,
      referenceNumber: input.referenceNumber ?? null,
      status,
    },
    summary: `${actor.userName} recorded a ${status.toLowerCase()} collection of ${amount} for rental ${rental.rentalNumber}.`,
    db: tx,
    throwOnError: true,
  });

  return {
    collection,
    summary,
    outstandingBefore: applied?.outstandingBefore ?? null,
    outstandingAfter: applied?.outstandingAfter ?? null,
    duplicate: false,
  };
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
          rentalDueId: true,
          amount: true,
          status: true,
          notes: true,
        },
      });

      if (!collection) {
        throw new AppError("Collection not found", 404, ErrorCode.NOT_FOUND);
      }

      if (!collection.rentalDueId) {
        throw new AppError(
          "Collection is not linked to a rental due",
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

      const due = await assertCollectibleDue(tx, collection.rentalDueId);
      const rental = due.rental;
      const amount = toDecimal(collection.amount);
      const applied = await applyCollectionToDue(tx, due, amount);

      const reconciledAt = input.reconciledAt ?? new Date();
      const updated = await tx.collection.update({
        where: { id },
        data: {
          status: "CLEARED",
          reconciledAt,
          reconciledById: actor.userId,
        },
        select: collectionDetailSelect,
      });

      await createCollectionLedgerEntry(tx, {
        rentalId: rental.id,
        collectionId: collection.id,
        amount,
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
          rentalDueId: due.id,
        },
        summary: `${actor.userName} cleared collection ${collection.id} for rental ${rental.rentalNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return {
        collection: updated,
        summary,
        outstandingBefore: applied.outstandingBefore,
        outstandingAfter: applied.outstandingAfter,
      };
    });
  } catch (err) {
    rethrowPrismaError(err, "Collection could not be cleared");
  }
}

export async function listCollections(query: ListCollectionsQuery) {
  const { page, limit, search } = query;

  const where: Prisma.CollectionWhereInput = { purpose: "RENT" };
  if (query.rentalId) where.rentalDue = { rentalId: query.rentalId };
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
      {
        rentalDue: {
          rental: {
            rentalNumber: { contains: search, mode: "insensitive" },
          },
        },
      },
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

  const where: Prisma.CollectionWhereInput = { rentalDue: { rentalId } };
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

  const where: Prisma.RentalDueWhereInput = { rentalId };
  if (query.status) where.status = query.status;

  const orderBy: Prisma.RentalDueOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [dues, total, summary] = await Promise.all([
    prisma.rentalDue.findMany({
      where,
      select: rentalDueSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.rentalDue.count({ where }),
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
