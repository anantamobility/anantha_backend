import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import { AppError } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { toDecimal } from "./rental-schedule.js";
import { generateRentalDues, rentalDueSelect } from "./rental-dues.js";
import { collectionSelect } from "./collection.js";
import type {
  GenerateClientDuesInput,
  ListClientCollectionsQuery,
  ListClientDuesQuery,
} from "../validation/clientFinance.js";

type Tx = Prisma.TransactionClient;
type ClientDb = Pick<Tx, "client">;
type FinanceDb = Pick<
  Tx,
  "rental" | "rentalDue" | "collection"
>;

const TERMINAL_RENTAL_STATUSES = [
  "COMPLETED",
  "TERMINATED",
  "CANCELLED",
] as const;

type ClientRecord = {
  id: string;
  clientCode: string | null;
  name: string;
  isActive: boolean;
  deletedAt: Date | null;
};

async function assertClient(
  db: ClientDb,
  clientId: string,
  options: { requireActive?: boolean } = {}
): Promise<ClientRecord> {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      clientCode: true,
      name: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (!client || client.deletedAt) {
    throw new AppError("Client not found", 404);
  }
  if (options.requireActive && !client.isActive) {
    throw new AppError(
      "Client is inactive and cannot be used for financial operations",
      409
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
      startDate: true,
      endDate: true,
    },
    orderBy: { startDate: "asc" },
  });

  const rentalIds = rentals.map((rental) => rental.id);

  const dues = rentalIds.length
    ? await db.rentalDue.findMany({
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
    where: { clientId: client.id },
    select: {
      amount: true,
      rentalDue: { select: { rentalId: true } },
    },
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
    const rentalId = collection.rentalDue?.rentalId;
    if (!rentalId) continue;
    const bucket = perRental.get(rentalId);
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
      });
      const now = new Date();
      const throughDate =
        input.throughDate && input.throughDate.getTime() < now.getTime()
          ? input.throughDate
          : now;

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
          409
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
        summary: `${actor.userName} generated ${generated} collection due(s) across ${rentals.length} rental(s) for client ${client.clientCode ?? client.name}.`,
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
    throw AppError.fromPrisma(err, "Client dues could not be generated") ?? err;
  }
}

export async function listClientDues(
  clientId: string,
  query: ListClientDuesQuery
) {
  const client = await assertClient(prisma, clientId);
  const { page, limit } = query;

  const where: Prisma.RentalDueWhereInput = {
    rental: { clientId: client.id, rentalType: "B2B" },
  };
  if (query.status) where.status = query.status;
  if (query.rentalId) where.rentalId = query.rentalId;

  const orderBy: Prisma.RentalDueOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [dues, total] = await Promise.all([
    prisma.rentalDue.findMany({
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
    prisma.rentalDue.count({ where }),
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
  if (query.paymentMethod) where.paymentMethod = query.paymentMethod;
  if (query.rentalId) where.rentalDue = { rentalId: query.rentalId };
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
