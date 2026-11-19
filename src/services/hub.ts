import prisma from "../database/prismaClient.js";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { stateCodeFor } from "../utils/indianStates.js";
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
  contracts: true,
  inventoryBalances: true,
  movementsFrom: true,
  movementsTo: true,
} as const;

function toJsonValue(
  value: CreateHubInput["address"]
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

function hubCodePrefix(state: string, city: string) {
  const stateCode = stateCodeFor(state);
  if (!stateCode) {
    throw new AppError(
      `Unknown state "${state}". Use the full Indian state or union territory name.`,
      400
    );
  }

  const cityCode = city.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase();
  return `${stateCode}-${cityCode}-`;
}

async function nextHubCode(tx: Prisma.TransactionClient, prefix: string) {
  const lastHub = await tx.hub.findFirst({
    where: { hubCode: { startsWith: prefix, mode: "insensitive" } },
    orderBy: { hubCode: "desc" },
    select: { hubCode: true },
  });

  const lastNumber = lastHub ? Number.parseInt(lastHub.hubCode.slice(prefix.length), 10) : 0;
  const nextNumber = Number.isFinite(lastNumber) && lastNumber > 0 ? lastNumber + 1 : 1;
  return `${prefix}${String(nextNumber).padStart(3, "0")}`;
}

export async function createHub(input: CreateHubInput, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const prefix = hubCodePrefix(input.state, input.city);
      const hubCode = await nextHubCode(tx, prefix);

      const data: Prisma.HubCreateInput = {
        name: input.name,
        hubCode,
        city: input.city,
        state: input.state,
        isActive: input.isActive ?? true,
      };

      if (input.address !== undefined) data.address = toJsonValue(input.address);
      if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone;
      if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail;

      const hub = await tx.hub.create({ data });
      const { address: _address, ...hubAudit } = hub;

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Hub",
        resourceId: hub.id,
        newData: hubAudit,
        summary: `${actor.userName} created hub ${hub.name}.`,
        db: tx,
        throwOnError: true,
      });

      return hub;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "A hub with this name or code already exists") ?? err;
  }
}

export async function listHubs(query: ListHubsQuery) {
  const { page, limit, search, isActive } = query;

  const where: Prisma.HubWhereInput = {};
  if (typeof isActive === "boolean") where.isActive = isActive;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { hubCode: { contains: search, mode: "insensitive" } },
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

export async function getHubById(id: string) {
  const hub = await prisma.hub.findUnique({
    where: { id },
    include: {
      _count: {
        select: { vehicles: true, staff: true, riders: true },
      },
    },
  });

  if (!hub) {
    throw new AppError("Hub not found", 404);
  }

  return hub;
}

export async function updateHub(id: string, input: UpdateHubInput, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.hub.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError("Hub not found", 404);
      }

      const data: Prisma.HubUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.city !== undefined) data.city = input.city;
      if (input.state !== undefined) data.state = input.state;
      if (input.address !== undefined) data.address = toJsonValue(input.address);
      if (input.contactPhone !== undefined) {
        data.contactPhone = input.contactPhone;
      }
      if (input.contactEmail !== undefined) {
        data.contactEmail = input.contactEmail;
      }
      if (input.isActive !== undefined) data.isActive = input.isActive;

      const hub = await tx.hub.update({ where: { id }, data });

      const { address: _oldAddress, ...hubBefore } = existing;
      const { address: _newAddress, ...hubAfter } = hub;

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Hub",
        resourceId: hub.id,
        oldData: hubBefore,
        newData: hubAfter,
        summary: `${actor.userName} updated hub ${hub.name}.`,
        db: tx,
        throwOnError: true,
      });

      return hub;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "A hub with this name or code already exists") ?? err;
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
        throw new AppError("Hub not found", 404);
      }

      const dependencyCount = Object.values(hub._count).reduce(
        (total, count) => total + count,
        0
      );

      if (dependencyCount > 0) {
        throw new AppError(
          "Hub cannot be deleted while it has associated records",
          409
        );
      }

      await tx.hub.delete({ where: { id } });

      const { address: _address, ...hubAudit } = hub;

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "Hub",
        resourceId: hub.id,
        oldData: hubAudit,
        summary: `${actor.userName} deleted hub ${hub.name}.`,
        db: tx,
        throwOnError: true,
      });

      return hub;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Hub could not be deleted") ?? err;
  }
}
