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
import {
  generateRentalDues,
  refreshOverdueDues,
  rentalDueSelect,
} from "./rental-dues.js";
import {
  allocateToDues,
  collectionSelect,
  createCollectionLedgerEntry,
} from "./collection.js";
import type {
  GenerateClientDuesInput,
  ListClientCollectionsQuery,
  ListClientDuesQuery,
  RecordClientPaymentInput,
} from "../validation/clientFinance.js";

type Tx = Prisma.TransactionClient;
type ClientDb = Pick<Tx, "client">;
type FinanceDb = Pick<
  Tx,
  "rental" | "rentalCollectionDue" | "collection"
>;

const OPEN_DUE_STATUSES = ["PENDING", "PARTIALLY_PAID", "OVERDUE"] as const;
const COLLECTIBLE_RENTAL_STATUSES = ["ACTIVE", "ON_HOLD"] as const;
const TERMINAL_RENTAL_STATUSES = [
  "COMPLETED",
  "TERMINATED",
  "CANCELLED",
] as const;

type ClientRecord = {
  id: string;
  clientCode: string;
  name: string;
  type: string;
  isActive: boolean;
  deletedAt: Date | null;
};

async function assertClient(
  db: ClientDb,
  clientId: string,
  options: { requireActive?: boolean; requireCorporate?: boolean } = {}
): Promise<ClientRecord> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      clientCode: true,
      name: true,
      type: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (!client || client.deletedAt) {
    throw new AppError("Client not found", 404, ErrorCode.NOT_FOUND);
  }
  if (options.requireActive && !client.isActive) {
    throw new AppError(
      "Client is inactive and cannot be used for financial operations",
      409,
      ErrorCode.CONFLICT
    );
  }
  if (options.requireCorporate && client.type !== "CORPORATE") {
    throw new AppError(
      "Consolidated client financials require a CORPORATE client",
      409,
      ErrorCode.CONFLICT
    );
  }

  return client;
}

export async function buildClientFinancialSummary(
  db: FinanceDb,
  client: ClientRecord
) {
  const rentals = await db.rental.findMany({
    where: { clientId: client.id, rentalType: "B2B" },
    select: {
      id: true,
      rentalNumber: true,
      status: true,
      collectionPeriod: true,
      currency: true,
      startDate: true,
      endDate: true,
    },
    orderBy: { startDate: "asc" },
  });

  const rentalIds = rentals.map((rental) => rental.id);

  const dues = rentalIds.length
    ? await db.rentalCollectionDue.findMany({
        where: { rentalId: { in: rentalIds } },
        select: {
          rentalId: true,
          amountDue: true,
          amountCollected: true,
          outstandingAmount: true,
          status: true,
          dueDate: true,
        },
      })
    : [];

  const collections = await db.collection.findMany({
    where: { clientId: client.id, status: "CLEARED" },
    select: { amount: true, rentalId: true },
  });

  const now = Date.now();

  const perRental = new Map<
    string,
    {
      totalCharges: Prisma.Decimal;
      totalCollectedOnDues: Prisma.Decimal;
      confirmedCollections: Prisma.Decimal;
      outstanding: Prisma.Decimal;
      overdueOutstanding: Prisma.Decimal;
      dueCount: number;
      openDueCount: number;
      overdueDueCount: number;
    }
  >();

  for (const rental of rentals) {
    perRental.set(rental.id, {
      totalCharges: new Prisma.Decimal(0),
      totalCollectedOnDues: new Prisma.Decimal(0),
      confirmedCollections: new Prisma.Decimal(0),
      outstanding: new Prisma.Decimal(0),
      overdueOutstanding: new Prisma.Decimal(0),
      dueCount: 0,
      openDueCount: 0,
      overdueDueCount: 0,
    });
  }

  for (const due of dues) {
    const bucket = perRental.get(due.rentalId);
    if (!bucket) continue;

    const outstanding = toDecimal(due.outstandingAmount);
    const isOpen = due.status !== "PAID" && outstanding.gt(0);
    const isOverdue =
      isOpen &&
      (due.status === "OVERDUE" || due.dueDate.getTime() < now);

    bucket.totalCharges = bucket.totalCharges.add(toDecimal(due.amountDue));
    bucket.totalCollectedOnDues = bucket.totalCollectedOnDues.add(
      toDecimal(due.amountCollected)
    );
    bucket.outstanding = bucket.outstanding.add(outstanding);
    bucket.dueCount += 1;
    if (isOpen) bucket.openDueCount += 1;
    if (isOverdue) {
      bucket.overdueDueCount += 1;
      bucket.overdueOutstanding = bucket.overdueOutstanding.add(outstanding);
    }
  }

  for (const collection of collections) {
    if (!collection.rentalId) continue;
    const bucket = perRental.get(collection.rentalId);
    if (!bucket) continue;
    bucket.confirmedCollections = bucket.confirmedCollections.add(
      toDecimal(collection.amount)
    );
  }

  const summary = rentals.reduce(
    (acc, rental) => {
      const bucket = perRental.get(rental.id)!;
      return {
        totalCharges: acc.totalCharges.add(bucket.totalCharges),
        totalCollectedOnDues: acc.totalCollectedOnDues.add(
          bucket.totalCollectedOnDues
        ),
        confirmedCollections: acc.confirmedCollections.add(
          bucket.confirmedCollections
        ),
        outstanding: acc.outstanding.add(bucket.outstanding),
        overdueOutstanding: acc.overdueOutstanding.add(
          bucket.overdueOutstanding
        ),
        dueCount: acc.dueCount + bucket.dueCount,
        openDueCount: acc.openDueCount + bucket.openDueCount,
        overdueDueCount: acc.overdueDueCount + bucket.overdueDueCount,
      };
    },
    {
      totalCharges: new Prisma.Decimal(0),
      totalCollectedOnDues: new Prisma.Decimal(0),
      confirmedCollections: new Prisma.Decimal(0),
      outstanding: new Prisma.Decimal(0),
      overdueOutstanding: new Prisma.Decimal(0),
      dueCount: 0,
      openDueCount: 0,
      overdueDueCount: 0,
    }
  );

  return {
    client,
    summary: {
      ...summary,
      rentalCount: rentals.length,
      activeRentalCount: rentals.filter(
        (rental) => rental.status === "ACTIVE" || rental.status === "ON_HOLD"
      ).length,
    },
    rentals: rentals.map((rental) => ({
      ...rental,
      ...perRental.get(rental.id)!,
    })),
  };
}

export async function getClientFinancialSummary(clientId: string) {
  const client = await assertClient(prisma, clientId);
  return buildClientFinancialSummary(prisma, client);
}

export async function generateClientDues(
  clientId: string,
  input: GenerateClientDuesInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const client = await assertClient(tx, clientId, {
        requireActive: true,
        requireCorporate: true,
      });
      const throughDate = input.throughDate ?? new Date();

      const rentals = await tx.rental.findMany({
        where: {
          clientId: client.id,
          rentalType: "B2B",
          status: { notIn: [...TERMINAL_RENTAL_STATUSES] },
          startDate: { lte: throughDate },
        },
        select: { id: true, rentalNumber: true, status: true },
        orderBy: { startDate: "asc" },
      });

      if (rentals.length === 0) {
        throw new AppError(
          "Client has no B2B rentals eligible for due generation",
          409,
          ErrorCode.CONFLICT
        );
      }

      const results: Array<{
        rentalId: string;
        rentalNumber: string;
        periodsProcessed: number;
        generated: number;
      }> = [];
      let generated = 0;

      for (const rental of rentals) {
        const result = await generateRentalDues(tx, {
          rentalId: rental.id,
          throughDate,
          actor,
        });
        generated += result.generated;
        results.push({
          rentalId: rental.id,
          rentalNumber: rental.rentalNumber,
          periodsProcessed: result.periodsProcessed,
          generated: result.generated,
        });
      }

      await logAudit({
        ...actor,
        action: "GENERATE",
        resource: "Client",
        resourceId: client.id,
        newData: {
          clientCode: client.clientCode,
          throughDate,
          rentalsProcessed: rentals.length,
          generated,
        },
        summary: `${actor.userName} generated ${generated} collection due(s) across ${rentals.length} rental(s) for client ${client.clientCode}.`,
        db: tx,
        throwOnError: true,
      });

      return {
        client,
        throughDate,
        rentalsProcessed: rentals.length,
        generated,
        results,
      };
    });
  } catch (err) {
    rethrowPrismaError(err, "Client dues could not be generated");
  }
}

export async function recordClientPayment(
  clientId: string,
  input: RecordClientPaymentInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const client = await assertClient(tx, clientId, {
        requireActive: true,
        requireCorporate: true,
      });

      const amount = new Prisma.Decimal(input.amount);
      const receivedAt = input.receivedAt ?? new Date();
      const baseKey =
        input.idempotencyKey ??
        (input.referenceNumber
          ? `client-payment:${client.id}:${input.referenceNumber}`
          : `client-payment:${client.id}:${uuidv4()}`);

      const existing = await tx.collection.findFirst({
        where: { idempotencyKey: { startsWith: `${baseKey}:` } },
        select: collectionSelect,
      });

      if (existing) {
        const summary = await buildClientFinancialSummary(tx, client);
        return {
          collections: [],
          allocations: [],
          summary,
          duplicate: true,
        };
      }

      let rentals: Array<{
        id: string;
        rentalNumber: string;
        currency: string;
      }>;

      if (input.rentalId) {
        const rental = await tx.rental.findUnique({
          where: { id: input.rentalId },
          select: {
            id: true,
            rentalNumber: true,
            clientId: true,
            rentalType: true,
            status: true,
            currency: true,
          },
        });

        if (!rental) {
          throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
        }
        if (rental.clientId !== client.id || rental.rentalType !== "B2B") {
          throw new AppError(
            "Rental does not belong to the selected B2B client",
            409,
            ErrorCode.CONFLICT
          );
        }
        if (
          !COLLECTIBLE_RENTAL_STATUSES.includes(
            rental.status as (typeof COLLECTIBLE_RENTAL_STATUSES)[number]
          )
        ) {
          throw new AppError(
            `Client payments can only be recorded against an ACTIVE or ON_HOLD rental (current status: ${rental.status})`,
            409,
            ErrorCode.CONFLICT
          );
        }

        rentals = [
          {
            id: rental.id,
            rentalNumber: rental.rentalNumber,
            currency: rental.currency,
          },
        ];
      } else {
        rentals = await tx.rental.findMany({
          where: {
            clientId: client.id,
            rentalType: "B2B",
            status: { in: [...COLLECTIBLE_RENTAL_STATUSES] },
          },
          select: { id: true, rentalNumber: true, currency: true },
          orderBy: { startDate: "asc" },
        });
      }

      if (rentals.length === 0) {
        throw new AppError(
          "Client has no active B2B rentals to receive a payment",
          409,
          ErrorCode.CONFLICT
        );
      }

      for (const rental of rentals) {
        await refreshOverdueDues(tx, rental.id);
      }

      const dues = await tx.rentalCollectionDue.findMany({
        where: {
          rentalId: { in: rentals.map((rental) => rental.id) },
          status: { in: [...OPEN_DUE_STATUSES] },
          outstandingAmount: { gt: 0 },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: { rentalId: true, outstandingAmount: true },
      });

      const totalOutstanding = dues.reduce(
        (total, due) => total.add(toDecimal(due.outstandingAmount)),
        new Prisma.Decimal(0)
      );

      if (totalOutstanding.lte(0)) {
        throw new AppError(
          "Client has no outstanding collection dues",
          409,
          ErrorCode.CONFLICT
        );
      }
      if (amount.gt(totalOutstanding)) {
        throw new AppError(
          "Client payment exceeds the total outstanding balance",
          409,
          ErrorCode.CONFLICT
        );
      }

      const outstandingByRental = new Map<string, Prisma.Decimal>();
      for (const due of dues) {
        const current =
          outstandingByRental.get(due.rentalId) ?? new Prisma.Decimal(0);
        outstandingByRental.set(
          due.rentalId,
          current.add(toDecimal(due.outstandingAmount))
        );
      }

      let remaining = amount;
      const collections: unknown[] = [];
      const allocations: Array<{
        rentalId: string;
        rentalNumber: string;
        amount: string;
        dueAllocations: Array<{ dueId: string; amount: Prisma.Decimal }>;
      }> = [];

      for (const rental of rentals) {
        if (remaining.lte(0)) break;

        const rentalOutstanding =
          outstandingByRental.get(rental.id) ?? new Prisma.Decimal(0);
        if (rentalOutstanding.lte(0)) continue;

        const applied = Prisma.Decimal.min(rentalOutstanding, remaining);
        const allocation = await allocateToDues(tx, rental.id, applied);

        const collection = await tx.collection.create({
          data: {
            payerType: "CLIENT",
            clientId: client.id,
            riderId: null,
            rentalId: rental.id,
            rentalDueId: allocation.primaryDueId,
            amount: applied,
            currency: rental.currency,
            paymentMethod: input.paymentMethod,
            referenceNumber: input.referenceNumber ?? null,
            receivedAt,
            status: "CLEARED",
            receivedById: actor.userId,
            reconciledAt: receivedAt,
            reconciledById: actor.userId,
            idempotencyKey: `${baseKey}:${rental.id}`,
            notes: input.notes ?? null,
          },
          select: collectionSelect,
        });

        await createCollectionLedgerEntry(tx, {
          rentalId: rental.id,
          collectionId: collection.id,
          amount: applied,
          currency: rental.currency,
          occurredAt: receivedAt,
          actor,
          description: input.notes
            ? `Client payment: ${input.notes}`
            : `Client payment for rental ${rental.rentalNumber}`,
        });

        collections.push(collection);
        allocations.push({
          rentalId: rental.id,
          rentalNumber: rental.rentalNumber,
          amount: applied.toString(),
          dueAllocations: allocation.allocations,
        });

        remaining = remaining.sub(applied);
      }

      if (remaining.gt(0)) {
        throw new AppError(
          "Client payment could not be fully allocated; please retry",
          409,
          ErrorCode.CONFLICT
        );
      }

      const summary = await buildClientFinancialSummary(tx, client);

      await logAudit({
        ...actor,
        action: "COLLECTION_RECEIVED",
        resource: "Client",
        resourceId: client.id,
        newData: {
          clientCode: client.clientCode,
          amount,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          allocations,
        },
        summary: `${actor.userName} recorded a consolidated payment of ${amount} for client ${client.clientCode}.`,
        db: tx,
        throwOnError: true,
      });

      return { collections, allocations, summary, duplicate: false };
    });
  } catch (err) {
    rethrowPrismaError(err, "Client payment could not be recorded");
  }
}

export async function listClientDues(
  clientId: string,
  query: ListClientDuesQuery
) {
  const client = await assertClient(prisma, clientId);
  const { page, limit } = query;

  const where: Prisma.RentalCollectionDueWhereInput = {
    rental: { clientId: client.id, rentalType: "B2B" },
  };
  if (query.status) where.status = query.status;
  if (query.rentalId) where.rentalId = query.rentalId;

  const orderBy: Prisma.RentalCollectionDueOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [dues, total] = await Promise.all([
    prisma.rentalCollectionDue.findMany({
      where,
      select: {
        ...rentalDueSelect,
        rental: {
          select: { id: true, rentalNumber: true, status: true },
        },
      },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.rentalCollectionDue.count({ where }),
  ]);

  return {
    client,
    dues,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function listClientCollections(
  clientId: string,
  query: ListClientCollectionsQuery
) {
  const client = await assertClient(prisma, clientId);
  const { page, limit } = query;

  const where: Prisma.CollectionWhereInput = {
    clientId: client.id,
    payerType: "CLIENT",
  };
  if (query.status) where.status = query.status;
  if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
  if (query.rentalId) where.rentalId = query.rentalId;
  if (query.from || query.to) {
    where.receivedAt = {};
    if (query.from) where.receivedAt.gte = query.from;
    if (query.to) where.receivedAt.lte = query.to;
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
    client,
    collections,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
