import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import { AppError } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { deriveDueStatus, toDecimal } from "./rental-schedule.js";
import { recordLedgerEntry } from "./ledger.js";
import { rentalDueSelect } from "./rental-dues.js";
import type {
  CreateCollectionInput,
  ListCollectionsQuery,
} from "../validation/collection.js";

type Tx = Prisma.TransactionClient;

const COLLECTIBLE_RENTAL_STATUSES = ["ACTIVE", "COMPLETED"] as const;

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
  receivedById: true,
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
    throw new AppError("Rental due not found", 404);
  }

  if (
    !COLLECTIBLE_RENTAL_STATUSES.includes(
      due.rental.status as (typeof COLLECTIBLE_RENTAL_STATUSES)[number]
    )
  ) {
    throw new AppError(
      `Collections can only be recorded against an ACTIVE or COMPLETED rental (current status: ${due.rental.status})`,
      409
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
      409
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
      409
    );
  }

  return { outstandingBefore: outstanding, outstandingAfter: nextOutstanding };
}

export async function createCollection(
  input: CreateCollectionInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const due = await assertCollectibleDue(tx, input.rentalDueId);
      const rental = due.rental;
      const amount = new Prisma.Decimal(input.amount);
      const receivedAt = input.receivedAt ?? new Date();

      const applied = await applyCollectionToDue(tx, due, amount);

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
          receivedById: actor.userId,
          notes: input.notes ?? null,
        },
        select: collectionDetailSelect,
      });

      await recordLedgerEntry(
        tx,
        {
          rentalId: rental.id,
          entryType: "COLLECTION_RECEIVED",
          direction: "CREDIT",
          amount,
          occurredAt: receivedAt,
          description: input.notes
            ? `Collection received: ${input.notes}`
            : `Collection received for rental ${rental.rentalNumber}`,
          sourceType: "Collection",
          sourceId: collection.id,
        },
        actor.userId
      );

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
        },
        summary: `${actor.userName} recorded a collection of ${amount} for rental ${rental.rentalNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return {
        collection,
        outstandingBefore: applied.outstandingBefore,
        outstandingAfter: applied.outstandingAfter,
      };
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Collection could not be recorded") ?? err;
  }
}

export async function listCollections(query: ListCollectionsQuery) {
  const { page, limit, search } = query;

  const where: Prisma.CollectionWhereInput = {};
  if (query.purpose) where.purpose = query.purpose;
  if (query.rentalId) where.rentalDue = { rentalId: query.rentalId };
  if (query.clientId) where.clientId = query.clientId;
  if (query.riderId) where.riderId = query.riderId;
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
    throw new AppError("Collection not found", 404);
  }

  return collection;
}
