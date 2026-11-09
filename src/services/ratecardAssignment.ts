import prisma from "../database/prismaClient.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { rateCardListSelect } from "./ratecard.js";
import type {
  CreateRateCardAssignmentInput,
  ListClientRateCardsQuery,
  ListRateCardAssignmentsQuery,
  ListRateCardClientsQuery,
  UnassignRateCardAssignmentInput,
  UpdateRateCardAssignmentInput,
} from "../validation/ratecardAssignment.js";

export const assignmentClientSelect = {
  id: true,
  clientCode: true,
  type: true,
  name: true,
  companyName: true,
  contactPerson: true,
  email: true,
  phoneNumber: true,
  isActive: true,
} as const;

export const rateCardAssignmentListSelect = {
  id: true,
  clientId: true,
  rateCardId: true,
  validFrom: true,
  validUntil: true,
  status: true,
  assignedAt: true,
  assignedById: true,
  unassignedAt: true,
  unassignedById: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
  client: { select: assignmentClientSelect },
  rateCard: { select: rateCardListSelect },
} as const;

export const rateCardAssignmentDetailSelect = {
  ...rateCardAssignmentListSelect,
  _count: {
    select: {
      rentals: true,
    },
  },
} as const;

type AssignmentAuditShape = {
  clientId: string;
  rateCardId: string;
  validFrom: Date;
  validUntil: Date | null;
  status: string;
  assignedAt: Date;
  unassignedAt: Date | null;
  reason: string | null;
};

function assignmentSnapshot(assignment: AssignmentAuditShape) {
  return {
    clientId: assignment.clientId,
    rateCardId: assignment.rateCardId,
    validFrom: assignment.validFrom,
    validUntil: assignment.validUntil,
    status: assignment.status,
    assignedAt: assignment.assignedAt,
    unassignedAt: assignment.unassignedAt,
    reason: assignment.reason,
  };
}

function assertDateRange(validFrom: Date, validUntil: Date | null) {
  if (validUntil && validUntil.getTime() <= validFrom.getTime()) {
    throw new AppError(
      "validUntil must be later than validFrom",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

async function assertClient(
  tx: Prisma.TransactionClient,
  clientId: string
) {
  const client = await tx.client.findUnique({
    where: { id: clientId },
    select: { id: true, isActive: true, deletedAt: true },
  });

  if (!client || client.deletedAt) {
    throw new AppError("Client not found", 404, ErrorCode.NOT_FOUND);
  }

  return client;
}

async function assertRateCard(
  tx: Prisma.TransactionClient,
  rateCardId: string
) {
  const rateCard = await tx.rateCard.findUnique({
    where: { id: rateCardId },
    select: { id: true, isActive: true },
  });

  if (!rateCard) {
    throw new AppError("Ratecard not found", 404, ErrorCode.NOT_FOUND);
  }

  return rateCard;
}

async function assertActiveEntities(
  tx: Prisma.TransactionClient,
  clientId: string,
  rateCardId: string
) {
  const [client, rateCard] = await Promise.all([
    assertClient(tx, clientId),
    assertRateCard(tx, rateCardId),
  ]);

  if (!client.isActive) {
    throw new AppError(
      "Client is inactive and cannot receive an active ratecard assignment",
      409,
      ErrorCode.CONFLICT
    );
  }

  if (!rateCard.isActive) {
    throw new AppError(
      "Ratecard is inactive and cannot be actively assigned",
      409,
      ErrorCode.CONFLICT
    );
  }
}

async function assertNoActiveDuplicate(
  tx: Prisma.TransactionClient,
  clientId: string,
  rateCardId: string,
  excludeId?: string
) {
  const duplicate = await tx.rateCardAssignment.findFirst({
    where: {
      clientId,
      rateCardId,
      status: "ACTIVE",
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });

  if (duplicate) {
    throw new AppError(
      "This ratecard is already actively assigned to this client",
      409,
      ErrorCode.CONFLICT
    );
  }
}

function assignmentListWhere(
  query:
    | ListRateCardAssignmentsQuery
    | ListClientRateCardsQuery
    | ListRateCardClientsQuery
) {
  const where: Prisma.RateCardAssignmentWhereInput = {};
  if ("clientId" in query && query.clientId) {
    where.clientId = query.clientId;
  }
  if ("rateCardId" in query && query.rateCardId) {
    where.rateCardId = query.rateCardId;
  }
  if (query.status) where.status = query.status;

  if (query.validOn) {
    where.validFrom = { lte: query.validOn };
    where.AND = [
      {
        OR: [{ validUntil: null }, { validUntil: { gte: query.validOn } }],
      },
    ];
  }

  return where;
}

export async function createRateCardAssignment(
  input: CreateRateCardAssignmentInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const status = input.status ?? "ACTIVE";
      const validFrom = input.validFrom ?? new Date();
      const validUntil = input.validUntil ?? null;
      assertDateRange(validFrom, validUntil);

      if (status === "ACTIVE") {
        await assertActiveEntities(tx, input.clientId, input.rateCardId);
        await assertNoActiveDuplicate(tx, input.clientId, input.rateCardId);
      } else {
        await Promise.all([
          assertClient(tx, input.clientId),
          assertRateCard(tx, input.rateCardId),
        ]);
      }

      const assignment = await tx.rateCardAssignment.create({
        data: {
          clientId: input.clientId,
          rateCardId: input.rateCardId,
          validFrom,
          validUntil,
          status,
          assignedAt: new Date(),
          assignedById: actor.userId,
          reason: input.reason ?? null,
        },
        select: rateCardAssignmentDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "RateCardAssignment",
        resourceId: assignment.id,
        newData: assignmentSnapshot(assignment),
        summary: `${actor.userName} assigned ratecard ${assignment.rateCard.code} to client ${assignment.client.clientCode}.`,
        db: tx,
        throwOnError: true,
      });

      return assignment;
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "This ratecard is already actively assigned to this client"
    );
  }
}

export async function listRateCardAssignments(
  query: ListRateCardAssignmentsQuery
) {
  const { page, limit } = query;
  const where = assignmentListWhere(query);

  const orderBy: Prisma.RateCardAssignmentOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [assignments, total] = await Promise.all([
    prisma.rateCardAssignment.findMany({
      where,
      select: rateCardAssignmentListSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.rateCardAssignment.count({ where }),
  ]);

  return {
    assignments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getRateCardAssignmentById(id: string) {
  const assignment = await prisma.rateCardAssignment.findUnique({
    where: { id },
    select: rateCardAssignmentDetailSelect,
  });

  if (!assignment) {
    throw new AppError(
      "Ratecard assignment not found",
      404,
      ErrorCode.NOT_FOUND
    );
  }

  return assignment;
}

export async function listRateCardsForClient(
  clientId: string,
  query: ListClientRateCardsQuery
) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, deletedAt: true },
  });

  if (!client || client.deletedAt) {
    throw new AppError("Client not found", 404, ErrorCode.NOT_FOUND);
  }

  const where = assignmentListWhere({
    ...query,
    clientId,
  } as ListRateCardAssignmentsQuery);
  if (query.search) {
    where.rateCard = {
      OR: [
        { code: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
        { vehicleCategory: { contains: query.search, mode: "insensitive" } },
      ],
    };
  }

  const orderBy: Prisma.RateCardAssignmentOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [rows, total] = await Promise.all([
    prisma.rateCardAssignment.findMany({
      where,
      select: rateCardAssignmentListSelect,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.rateCardAssignment.count({ where }),
  ]);

  return {
    rateCards: rows.map(({ rateCard, ...assignment }) => ({
      ...rateCard,
      assignment,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function listClientsForRateCard(
  rateCardId: string,
  query: ListRateCardClientsQuery
) {
  const rateCard = await prisma.rateCard.findUnique({
    where: { id: rateCardId },
    select: { id: true },
  });

  if (!rateCard) {
    throw new AppError("Ratecard not found", 404, ErrorCode.NOT_FOUND);
  }

  const where = assignmentListWhere({
    ...query,
    rateCardId,
  } as ListRateCardAssignmentsQuery);
  if (query.search) {
    where.client = {
      OR: [
        { clientCode: { contains: query.search, mode: "insensitive" } },
        { name: { contains: query.search, mode: "insensitive" } },
        { companyName: { contains: query.search, mode: "insensitive" } },
        { contactPerson: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    };
  }

  const orderBy: Prisma.RateCardAssignmentOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [rows, total] = await Promise.all([
    prisma.rateCardAssignment.findMany({
      where,
      select: rateCardAssignmentListSelect,
      orderBy,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
    prisma.rateCardAssignment.count({ where }),
  ]);

  return {
    clients: rows.map(({ client, ...assignment }) => ({
      ...client,
      assignment,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function updateRateCardAssignment(
  id: string,
  input: UpdateRateCardAssignmentInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.rateCardAssignment.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError(
          "Ratecard assignment not found",
          404,
          ErrorCode.NOT_FOUND
        );
      }

      if (existing.status === "CANCELLED") {
        throw new AppError(
          "Cancelled ratecard assignments cannot be modified",
          409,
          ErrorCode.CONFLICT
        );
      }

      const validFrom = input.validFrom ?? existing.validFrom;
      const validUntil =
        input.validUntil !== undefined
          ? input.validUntil
          : existing.validUntil;
      const status = input.status ?? existing.status;
      assertDateRange(validFrom, validUntil);

      const activating = status === "ACTIVE" && existing.status !== "ACTIVE";
      if (activating) {
        await assertActiveEntities(
          tx,
          existing.clientId,
          existing.rateCardId
        );
      }
      if (status === "ACTIVE") {
        await assertNoActiveDuplicate(
          tx,
          existing.clientId,
          existing.rateCardId,
          id
        );
      }

      const data: Prisma.RateCardAssignmentUncheckedUpdateInput = {};
      if (input.validFrom !== undefined) data.validFrom = input.validFrom;
      if (input.validUntil !== undefined) data.validUntil = input.validUntil;
      if (input.status !== undefined) data.status = input.status;
      if (input.reason !== undefined) data.reason = input.reason;

      const assignment = await tx.rateCardAssignment.update({
        where: { id },
        data,
        select: rateCardAssignmentDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "RateCardAssignment",
        resourceId: id,
        oldData: assignmentSnapshot(existing),
        newData: assignmentSnapshot(assignment),
        summary: `${actor.userName} updated ratecard assignment ${id}.`,
        db: tx,
        throwOnError: true,
      });

      return assignment;
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "This ratecard is already actively assigned to this client"
    );
  }
}

export async function unassignRateCard(
  id: string,
  input: UnassignRateCardAssignmentInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.rateCardAssignment.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError(
          "Ratecard assignment not found",
          404,
          ErrorCode.NOT_FOUND
        );
      }

      if (existing.status === "CANCELLED") {
        throw new AppError(
          "Ratecard assignment is already unassigned",
          409,
          ErrorCode.CONFLICT
        );
      }

      const activeRentals = await tx.rental.count({
        where: {
          rateCardAssignmentId: id,
          status: {
            in: ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "ON_HOLD"],
          },
        },
      });

      if (activeRentals > 0) {
        throw new AppError(
          "Ratecard assignment is referenced by active rentals and cannot be unassigned",
          409,
          ErrorCode.CONFLICT
        );
      }

      const unassignedAt = new Date();
      const updateResult = await tx.rateCardAssignment.updateMany({
        where: {
          id,
          status: existing.status,
        },
        data: {
          status: "CANCELLED",
          unassignedAt,
          unassignedById: actor.userId,
          reason: input.reason ?? existing.reason,
        },
      });

      if (updateResult.count === 0) {
        throw new AppError(
          "Ratecard assignment was modified concurrently; please retry",
          409,
          ErrorCode.CONFLICT
        );
      }

      const assignment = await tx.rateCardAssignment.findUniqueOrThrow({
        where: { id },
        select: rateCardAssignmentDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "UNASSIGN",
        resource: "RateCardAssignment",
        resourceId: id,
        oldData: assignmentSnapshot(existing),
        newData: assignmentSnapshot(assignment),
        summary: `${actor.userName} unassigned ratecard ${assignment.rateCard.code} from client ${assignment.client.clientCode}.`,
        db: tx,
        throwOnError: true,
      });

      return assignment;
    });
  } catch (err) {
    rethrowPrismaError(err, "Ratecard assignment could not be unassigned");
  }
}
