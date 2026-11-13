import prisma from "../database/prismaClient.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { assertHubAccess, isAdmin, actorHubId } from "../utils/scope.js";
import type { UserContext } from "../types/user.js";
import type {
  CreateHubInput,
  ListHubsQuery,
  UpdateHubInput,
} from "../validation/hub.js";

const hubDependencySelect = {
  vehicles: true,
  staff: true,
  riders: true,
  rentals: true,
  assignments: true,
  vehicleHubHistory: true,
  inventoryBalances: true,
  movementsFrom: true,
  movementsTo: true,
} as const;

function hubSnapshot(hub: {
  name: string;
  code: string;
  address: unknown;
  contactPhone: string | null;
  contactEmail: string | null;
  isActive: boolean;
}) {
  return {
    name: hub.name,
    code: hub.code,
    address: hub.address,
    contactPhone: hub.contactPhone,
    contactEmail: hub.contactEmail,
    isActive: hub.isActive,
  };
}

function toJsonValue(
  value: CreateHubInput["address"]
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

export async function createHub(input: CreateHubInput, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const data: Prisma.HubCreateInput = {
        name: input.name,
        code: input.code,
        isActive: input.isActive ?? true,
      };

      if (input.address !== undefined) data.address = toJsonValue(input.address);
      if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone;
      if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail;

      const hub = await tx.hub.create({ data });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Hub",
        resourceId: hub.id,
        newData: hubSnapshot(hub),
        summary: `${actor.userName} created hub ${hub.name}.`,
        db: tx,
        throwOnError: true,
      });

      return hub;
    });
  } catch (err) {
    rethrowPrismaError(err, "A hub with this name or code already exists");
  }
}

export async function listHubs(query: ListHubsQuery, user?: UserContext) {
  const { page, limit, search, isActive } = query;

  const where: Prisma.HubWhereInput = {};
  const scopedHubId = user && !isAdmin(user) ? actorHubId(user) : null;
  if (scopedHubId) where.id = scopedHubId;
  if (typeof isActive === "boolean") where.isActive = isActive;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
      { contactEmail: { contains: search, mode: "insensitive" } },
    ];
  }

  const [hubs, total] = await Promise.all([
    prisma.hub.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.hub.count({ where }),
  ]);

  return {
    hubs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getHubById(id: string, user?: UserContext) {
  const hub = await prisma.hub.findUnique({
    where: { id },
    include: {
      _count: {
        select: { vehicles: true, staff: true, riders: true },
      },
    },
  });

  if (!hub) {
    throw new AppError("Hub not found", 404, ErrorCode.NOT_FOUND);
  }

  assertHubAccess(user, hub.id);
  return hub;
}

export async function updateHub(
  id: string,
  input: UpdateHubInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.hub.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError("Hub not found", 404, ErrorCode.NOT_FOUND);
      }
      assertHubAccess(actor.user, existing.id);

      const data: Prisma.HubUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.code !== undefined) data.code = input.code;
      if (input.address !== undefined) data.address = toJsonValue(input.address);
      if (input.contactPhone !== undefined) {
        data.contactPhone = input.contactPhone;
      }
      if (input.contactEmail !== undefined) {
        data.contactEmail = input.contactEmail;
      }
      if (input.isActive !== undefined) data.isActive = input.isActive;

      const hub = await tx.hub.update({ where: { id }, data });

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Hub",
        resourceId: hub.id,
        oldData: hubSnapshot(existing),
        newData: hubSnapshot(hub),
        summary: `${actor.userName} updated hub ${hub.name}.`,
        db: tx,
        throwOnError: true,
      });

      return hub;
    });
  } catch (err) {
    rethrowPrismaError(err, "A hub with this name or code already exists");
  }
}

export async function deleteHub(id: string, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const hub = await tx.hub.findUnique({
        where: { id },
        include: { _count: { select: hubDependencySelect } },
      });

      if (!hub) {
        throw new AppError("Hub not found", 404, ErrorCode.NOT_FOUND);
      }
      assertHubAccess(actor.user, hub.id);

      const dependencyCount = Object.values(hub._count).reduce(
        (total, count) => total + count,
        0
      );

      if (dependencyCount > 0) {
        throw new AppError(
          "Hub cannot be deleted while it has associated records",
          409,
          ErrorCode.CONFLICT
        );
      }

      await tx.hub.delete({ where: { id } });

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "Hub",
        resourceId: hub.id,
        oldData: hubSnapshot(hub),
        summary: `${actor.userName} deleted hub ${hub.name}.`,
        db: tx,
        throwOnError: true,
      });

      return hub;
    });
  } catch (err) {
    rethrowPrismaError(err, "Hub could not be deleted");
  }
}
