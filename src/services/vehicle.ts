import prisma from "../database/prismaClient.js";
import { VehicleStatus } from "../generated/prisma/client.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { assertHubAccess, resolveHubFilter } from "../utils/scope.js";
import type { UserContext } from "../types/user.js";
import type {
  ChangeVehicleStatusInput,
  CreateVehicleInput,
  ListVehicleStatusHistoryQuery,
  ListVehiclesQuery,
  UpdateVehicleInput,
} from "../validation/vehicle.js";

export const vehicleHubSelect = {
  id: true,
  name: true,
  code: true,
  isActive: true,
} as const;

export const vehicleListSelect = {
  id: true,
  registrationNumber: true,
  hubId: true,
  make: true,
  model: true,
  year: true,
  color: true,
  vin: true,
  status: true,
  acquiredAt: true,
  retiredAt: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  hub: { select: vehicleHubSelect },
} as const;

export const vehicleDetailSelect = {
  ...vehicleListSelect,
  _count: {
    select: {
      assignments: true,
      services: true,
      documents: true,
      statusHistory: true,
    },
  },
} as const;

export const statusHistoryUserSelect = {
  id: true,
  name: true,
} as const;

// Operational lifecycle: only an IDLE vehicle can be deployed. In-service,
// repair and out-of-service vehicles must return to IDLE before deployment.
// DEPLOYED means actively allocated; RETIRED is terminal.
export const ALLOWED_VEHICLE_STATUS_TRANSITIONS: Record<
  VehicleStatus,
  readonly VehicleStatus[]
> = {
  IDLE: [
    VehicleStatus.DEPLOYED,
    VehicleStatus.IN_SERVICE,
    VehicleStatus.UNDER_REPAIR,
    VehicleStatus.OUT_OF_SERVICE,
    VehicleStatus.RETIRED,
  ],
  DEPLOYED: [
    VehicleStatus.IDLE,
    VehicleStatus.IN_SERVICE,
    VehicleStatus.UNDER_REPAIR,
    VehicleStatus.OUT_OF_SERVICE,
  ],
  IN_SERVICE: [
    VehicleStatus.IDLE,
    VehicleStatus.UNDER_REPAIR,
    VehicleStatus.OUT_OF_SERVICE,
    VehicleStatus.RETIRED,
  ],
  UNDER_REPAIR: [
    VehicleStatus.IDLE,
    VehicleStatus.IN_SERVICE,
    VehicleStatus.OUT_OF_SERVICE,
    VehicleStatus.RETIRED,
  ],
  OUT_OF_SERVICE: [
    VehicleStatus.IDLE,
    VehicleStatus.UNDER_REPAIR,
    VehicleStatus.RETIRED,
  ],
  RETIRED: [],
};

type VehicleAuditShape = {
  registrationNumber: string;
  hubId: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  vin: string | null;
  status: VehicleStatus;
  acquiredAt: Date | null;
  retiredAt: Date | null;
  isActive: boolean;
};

function vehicleSnapshot(vehicle: VehicleAuditShape) {
  return {
    registrationNumber: vehicle.registrationNumber,
    hubId: vehicle.hubId,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    color: vehicle.color,
    vin: vehicle.vin,
    status: vehicle.status,
    acquiredAt: vehicle.acquiredAt,
    retiredAt: vehicle.retiredAt,
    isActive: vehicle.isActive,
  };
}

async function assertHubExists(tx: Prisma.TransactionClient, hubId: string) {
  const hub = await tx.hub.findUnique({ where: { id: hubId } });
  if (!hub) {
    throw new AppError("Hub not found", 404, ErrorCode.NOT_FOUND);
  }
}

export async function createVehicle(
  input: CreateVehicleInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.hubId) await assertHubExists(tx, input.hubId);
      assertHubAccess(actor.req.user, input.hubId);

      const data: Prisma.VehicleUncheckedCreateInput = {
        registrationNumber: input.registrationNumber,
        hubId: input.hubId ?? null,
        make: input.make ?? null,
        model: input.model ?? null,
        year: input.year ?? null,
        color: input.color ?? null,
        vin: input.vin ?? null,
        status: VehicleStatus.IDLE,
        isActive: input.isActive ?? true,
      };

      if (input.acquiredAt !== undefined) data.acquiredAt = input.acquiredAt;

      const vehicle = await tx.vehicle.create({
        data,
        select: vehicleDetailSelect,
      });

      // Record the creation status so historical trend calculations have a
      // reliable first status transition for every newly created vehicle.
      await tx.vehicleStatusHistory.create({
        data: {
          vehicleId: vehicle.id,
          previousStatus: null,
          status: VehicleStatus.IDLE,
          changedById: actor.userId,
          reason: "Vehicle created",
        },
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Vehicle",
        resourceId: vehicle.id,
        newData: vehicleSnapshot(vehicle),
        summary: `${actor.userName} created vehicle ${vehicle.registrationNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return vehicle;
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A vehicle with this registration number or VIN already exists"
    );
  }
}

export async function listVehicles(query: ListVehiclesQuery, user?: UserContext) {
  const { page, limit, search, status, hubId, make, model, isActive } = query;

  const where: Prisma.VehicleWhereInput = { deletedAt: null };
  if (status) where.status = status;
  const scopedHubId = resolveHubFilter(user, hubId);
  if (scopedHubId) where.hubId = scopedHubId;
  if (typeof isActive === "boolean") where.isActive = isActive;
  if (make) where.make = { equals: make, mode: "insensitive" };
  if (model) where.model = { equals: model, mode: "insensitive" };

  if (search) {
    where.OR = [
      { registrationNumber: { contains: search, mode: "insensitive" } },
      { vin: { contains: search, mode: "insensitive" } },
      { make: { contains: search, mode: "insensitive" } },
      { model: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.VehicleOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [vehicles, total] = await Promise.all([
    prisma.vehicle.findMany({
      where,
      select: vehicleListSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.vehicle.count({ where }),
  ]);

  return {
    vehicles,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getVehicleById(id: string, user?: UserContext) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    select: { ...vehicleDetailSelect, deletedAt: true },
  });

  if (!vehicle || vehicle.deletedAt) {
    throw new AppError("Vehicle not found", 404, ErrorCode.NOT_FOUND);
  }

  assertHubAccess(user, vehicle.hubId);
  const { deletedAt: _deletedAt, ...safeVehicle } = vehicle;
  return safeVehicle;
}

export async function updateVehicle(
  id: string,
  input: UpdateVehicleInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.vehicle.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Vehicle not found", 404, ErrorCode.NOT_FOUND);
      }
      assertHubAccess(actor.req.user, existing.hubId);
      if (input.hubId !== undefined && input.hubId !== null) {
        assertHubAccess(actor.req.user, input.hubId);
      }

      if (
        input.hubId !== undefined &&
        input.hubId !== null &&
        input.hubId !== existing.hubId
      ) {
        await assertHubExists(tx, input.hubId);
      }

      const data: Prisma.VehicleUncheckedUpdateInput = {};
      if (input.registrationNumber !== undefined) {
        data.registrationNumber = input.registrationNumber;
      }
      if (input.hubId !== undefined) data.hubId = input.hubId;
      if (input.make !== undefined) data.make = input.make;
      if (input.model !== undefined) data.model = input.model;
      if (input.year !== undefined) data.year = input.year;
      if (input.color !== undefined) data.color = input.color;
      if (input.vin !== undefined) data.vin = input.vin;
      if (input.acquiredAt !== undefined) data.acquiredAt = input.acquiredAt;
      if (input.isActive !== undefined) data.isActive = input.isActive;

      const vehicle = await tx.vehicle.update({
        where: { id },
        data,
        select: vehicleDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Vehicle",
        resourceId: vehicle.id,
        oldData: vehicleSnapshot(existing),
        newData: vehicleSnapshot(vehicle),
        summary: `${actor.userName} updated vehicle ${vehicle.registrationNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return vehicle;
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A vehicle with this registration number or VIN already exists"
    );
  }
}

export async function deleteVehicle(id: string, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.vehicle.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Vehicle not found", 404, ErrorCode.NOT_FOUND);
      }

      const [activeAssignments, openServices] = await Promise.all([
        tx.vehicleAssignment.count({
          where: { vehicleId: id, status: "ACTIVE" },
        }),
        tx.service.count({
          where: {
            vehicleId: id,
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
        }),
      ]);

      if (activeAssignments > 0) {
        throw new AppError(
          "Vehicle cannot be deleted while it has an active assignment",
          409,
          ErrorCode.CONFLICT
        );
      }

      if (openServices > 0) {
        throw new AppError(
          "Vehicle cannot be deleted while it has an open service record",
          409,
          ErrorCode.CONFLICT
        );
      }

      // Soft delete keeps status history, services, documents and other
      // operational/audit records intact.
      const vehicle = await tx.vehicle.update({
        where: { id },
        data: { deletedAt: new Date() },
        select: vehicleDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "Vehicle",
        resourceId: vehicle.id,
        oldData: vehicleSnapshot(existing),
        summary: `${actor.userName} deleted vehicle ${vehicle.registrationNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return vehicle;
    });
  } catch (err) {
    rethrowPrismaError(err, "Vehicle could not be deleted");
  }
}

export async function changeVehicleStatus(
  id: string,
  input: ChangeVehicleStatusInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.findUnique({ where: { id } });
      if (!vehicle || vehicle.deletedAt) {
        throw new AppError("Vehicle not found", 404, ErrorCode.NOT_FOUND);
      }
      assertHubAccess(actor.req.user, vehicle.hubId);

      const previousStatus = vehicle.status;
      const nextStatus = input.status;

      if (previousStatus === nextStatus) {
        throw new AppError(
          `Vehicle already has status ${nextStatus}`,
          409,
          ErrorCode.CONFLICT
        );
      }

      if (!ALLOWED_VEHICLE_STATUS_TRANSITIONS[previousStatus].includes(nextStatus)) {
        throw new AppError(
          `Invalid status transition from ${previousStatus} to ${nextStatus}`,
          409,
          ErrorCode.CONFLICT
        );
      }

      const activeAssignments = await tx.vehicleAssignment.count({
        where: { vehicleId: id, status: "ACTIVE" },
      });

      if (
        activeAssignments > 0 &&
        nextStatus !== VehicleStatus.DEPLOYED
      ) {
        throw new AppError(
          "Vehicle has an active assignment and cannot change to this status",
          409,
          ErrorCode.CONFLICT
        );
      }

      const retiredAt =
        nextStatus === VehicleStatus.RETIRED ? new Date() : undefined;

      // Conditional update on the version we read guarantees that a concurrent
      // status change cannot silently overwrite a newer status.
      const updateResult = await tx.vehicle.updateMany({
        where: {
          id,
          status: previousStatus,
          version: vehicle.version,
          deletedAt: null,
        },
        data: {
          status: nextStatus,
          version: { increment: 1 },
          ...(retiredAt ? { retiredAt } : {}),
        },
      });

      if (updateResult.count === 0) {
        throw new AppError(
          "Vehicle status was modified concurrently; please retry",
          409,
          ErrorCode.CONFLICT
        );
      }

      const statusHistory = await tx.vehicleStatusHistory.create({
        data: {
          vehicleId: id,
          previousStatus,
          status: nextStatus,
          changedById: actor.userId,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
        },
        include: { changedBy: { select: statusHistoryUserSelect } },
      });

      const { deletedAt: _deletedAt, ...currentVehicle } = vehicle;
      const updatedVehicle = {
        ...currentVehicle,
        status: nextStatus,
        version: vehicle.version + 1,
        ...(retiredAt ? { retiredAt } : {}),
      };

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Vehicle",
        resourceId: id,
        oldData: { status: previousStatus },
        newData: {
          status: nextStatus,
          previousStatus,
          reason: input.reason ?? null,
        },
        summary: `${actor.userName} changed vehicle ${vehicle.registrationNumber} status from ${previousStatus} to ${nextStatus}.`,
        db: tx,
        throwOnError: true,
      });

      return { vehicle: updatedVehicle, statusHistory };
    });
  } catch (err) {
    rethrowPrismaError(err, "Vehicle status could not be changed");
  }
}

export async function getVehicleStatusHistory(
  id: string,
  query: ListVehicleStatusHistoryQuery,
  user?: UserContext
) {
  const { page, limit } = query;

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    select: { id: true, deletedAt: true, hubId: true },
  });

  if (!vehicle || vehicle.deletedAt) {
    throw new AppError("Vehicle not found", 404, ErrorCode.NOT_FOUND);
  }
  assertHubAccess(user, vehicle.hubId);

  const where: Prisma.VehicleStatusHistoryWhereInput = { vehicleId: id };
  if (query.status) where.status = query.status;
  if (query.startDate || query.endDate) {
    where.changedAt = {};
    if (query.startDate) where.changedAt.gte = query.startDate;
    if (query.endDate) where.changedAt.lte = query.endDate;
  }

  const orderBy: Prisma.VehicleStatusHistoryOrderByWithRelationInput[] =
    query.sortBy === "status"
      ? [
          { status: query.sortOrder },
          { changedAt: "desc" },
          { id: "desc" },
        ]
      : [{ changedAt: query.sortOrder }, { id: "desc" }];

  const [statusHistory, total] = await Promise.all([
    prisma.vehicleStatusHistory.findMany({
      where,
      include: { changedBy: { select: statusHistoryUserSelect } },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.vehicleStatusHistory.count({ where }),
  ]);

  return {
    statusHistory,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
