import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { deriveServiceChargeAllocation } from "./inventory.js";
import { calculateDueAmount } from "./rental-schedule.js";
import type {
  ApproveResponsibilityInput,
  AwaitPartsInput,
  AssignReplacementInput,
  CancelServiceInput,
  CloseServiceInput,
  CompleteServiceInput,
  CreateServiceChargeInput,
  CreateServiceInput,
  ListServicesQuery,
  ResumeServiceInput,
  ReturnReplacementInput,
  StartServiceInput,
  UpdateServiceInput,
} from "../validation/service.js";

type Tx = Prisma.TransactionClient;

export const SERVICE_STATUS_TRANSITIONS = {
  REPORTED: ["IN_PROGRESS", "CANCELLED"],
  APPROVED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["AWAITING_PARTS", "COMPLETED", "CANCELLED"],
  AWAITING_PARTS: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: ["CLOSED"],
  CLOSED: [],
  CANCELLED: [],
} as const;

const TERMINAL_SERVICE_STATUSES = ["CLOSED", "CANCELLED"];
const TERMINAL_RENTAL_STATUSES = ["COMPLETED", "TERMINATED", "CANCELLED"];
const RESPONSIBILITY_APPROVER_ROLES = ["ADMIN", "SUPERVISOR"];

const serviceVehicleSelect = {
  id: true,
  registrationNumber: true,
  make: true,
  model: true,
  status: true,
  hubId: true,
  isActive: true,
  version: true,
} as const;

const serviceRentalSelect = {
  id: true,
  rentalNumber: true,
  status: true,
  rentalType: true,
  clientId: true,
  riderId: true,
  hubId: true,
  startDate: true,
  endDate: true,
  currency: true,
} as const;

const serviceUserSelect = { id: true, name: true, email: true } as const;

const serviceSpareLineSelect = {
  id: true,
  spareId: true,
  quantity: true,
  unitCost: true,
  lineCost: true,
  createdAt: true,
  spare: {
    select: {
      id: true,
      partNumber: true,
      name: true,
      unitOfMeasure: true,
    },
  },
} as const;

const serviceChargeSelect = {
  id: true,
  chargeType: true,
  costAmount: true,
  billableAmount: true,
  recoverableFrom: true,
  status: true,
  currency: true,
  description: true,
  sourceType: true,
  sourceId: true,
  idempotencyKey: true,
  serviceSpareId: true,
  createdAt: true,
  updatedAt: true,
} as const;

const replacementAssignmentSelect = {
  id: true,
  serviceId: true,
  originalVehicleId: true,
  replacementVehicleId: true,
  rentalId: true,
  replacementRentalId: true,
  riderId: true,
  clientId: true,
  status: true,
  assignedAt: true,
  returnedAt: true,
  assignedById: true,
  returnedById: true,
  reason: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  originalVehicle: {
    select: { id: true, registrationNumber: true, make: true, model: true },
  },
  replacementVehicle: {
    select: {
      id: true,
      registrationNumber: true,
      make: true,
      model: true,
      status: true,
      hubId: true,
    },
  },
  replacementRental: { select: serviceRentalSelect },
} as const;

export const serviceListSelect = {
  id: true,
  serviceNumber: true,
  vehicleId: true,
  rentalId: true,
  serviceType: true,
  status: true,
  responsibleParty: true,
  reportedById: true,
  approvedById: true,
  assignedToId: true,
  reportedAt: true,
  startedAt: true,
  completedAt: true,
  closedAt: true,
  cancelledAt: true,
  cancellationReason: true,
  downtimeStart: true,
  downtimeEnd: true,
  downtimeReason: true,
  previousVehicleStatus: true,
  description: true,
  diagnosis: true,
  repairNotes: true,
  resolutionNotes: true,
  responsibilityApprovedAt: true,
  responsibilityInvestigationNotes: true,
  replacementVehicleId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  vehicle: { select: serviceVehicleSelect },
  rental: { select: serviceRentalSelect },
  reportedBy: { select: serviceUserSelect },
  approvedBy: { select: serviceUserSelect },
  assignedTo: { select: serviceUserSelect },
  replacementVehicle: {
    select: { id: true, registrationNumber: true, make: true, model: true },
  },
  rentalPause: {
    select: {
      id: true,
      status: true,
      previousRentalStatus: true,
      pausedAt: true,
      resumedAt: true,
      reason: true,
    },
  },
  _count: {
    select: {
      charges: true,
      spares: true,
      replacementAssignments: true,
    },
  },
} as const;

export const serviceDetailSelect = {
  ...serviceListSelect,
  statusChangedAt: true,
  responsibilityEvidence: true,
  charges: {
    select: serviceChargeSelect,
    orderBy: { createdAt: "asc" as const },
  },
  spares: {
    select: serviceSpareLineSelect,
    orderBy: { createdAt: "asc" as const },
  },
  replacementAssignments: {
    select: replacementAssignmentSelect,
    orderBy: { assignedAt: "desc" as const },
  },
} as const;

function generateServiceNumber() {
  return `SVC-${uuidv4().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

function isTerminal(status: string) {
  return TERMINAL_SERVICE_STATUSES.includes(status);
}

function money(value: Prisma.Decimal | null | undefined) {
  return value ?? new Prisma.Decimal(0);
}

async function assertVehicle(tx: Tx, vehicleId: string, requireAvailable = false) {
  const vehicle = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    select: {
      id: true,
      registrationNumber: true,
      status: true,
      hubId: true,
      isActive: true,
      version: true,
      deletedAt: true,
    },
  });

  if (!vehicle || vehicle.deletedAt) {
    throw new AppError("Vehicle not found", 404, ErrorCode.NOT_FOUND);
  }
  if (!vehicle.isActive) {
    throw new AppError(
      "Vehicle is inactive and cannot be used for service",
      409,
      ErrorCode.CONFLICT
    );
  }
  if (requireAvailable && ["RETIRED", "OUT_OF_SERVICE"].includes(vehicle.status)) {
    throw new AppError(
      `Vehicle is not serviceable in status ${vehicle.status}`,
      409,
      ErrorCode.CONFLICT
    );
  }
  return vehicle;
}

async function assertRental(tx: Tx, rentalId: string) {
  const rental = await tx.rental.findUnique({
    where: { id: rentalId },
    select: {
      id: true,
      rentalNumber: true,
      status: true,
      version: true,
      rentalType: true,
      clientId: true,
      riderId: true,
      hubId: true,
    },
  });
  if (!rental) {
    throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
  }
  if (TERMINAL_RENTAL_STATUSES.includes(rental.status)) {
    throw new AppError(
      `Service cannot be attached to a ${rental.status} rental`,
      409,
      ErrorCode.CONFLICT
    );
  }
  return rental;
}

async function assertNoOtherActiveDowntime(
  tx: Tx,
  vehicleId: string,
  serviceId?: string
) {
  const active = await tx.service.count({
    where: {
      vehicleId,
      id: serviceId ? { not: serviceId } : undefined,
      downtimeStart: { not: null },
      downtimeEnd: null,
      status: { notIn: ["COMPLETED", "CLOSED", "CANCELLED"] },
    },
  });
  if (active > 0) {
    throw new AppError(
      "Vehicle already has an active service downtime; complete or cancel it first",
      409,
      ErrorCode.CONFLICT
    );
  }
}

async function pauseRentalForService(
  tx: Tx,
  service: { id: string; serviceNumber: string; rentalId: string | null },
  at: Date,
  actor: AuditActor,
  reason: string
) {
  if (!service.rentalId) return null;

  const rental = await tx.rental.findUnique({
    where: { id: service.rentalId },
    select: {
      id: true,
      rentalNumber: true,
      status: true,
      version: true,
    },
  });

  if (!rental || TERMINAL_RENTAL_STATUSES.includes(rental.status)) return null;
  if (rental.status !== "ACTIVE" && rental.status !== "ON_HOLD") return null;

  const existing = await tx.rentalPause.findUnique({
    where: { serviceId: service.id },
    select: { id: true, status: true },
  });
  if (existing?.status === "ACTIVE") return existing;

  const previousRentalStatus = rental.status;

  if (rental.status === "ACTIVE") {
    const updated = await tx.rental.updateMany({
      where: { id: rental.id, status: "ACTIVE", version: rental.version },
      data: { status: "ON_HOLD", version: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw new AppError(
        "Rental was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }
  }

  const pause = await tx.rentalPause.create({
    data: {
      rentalId: rental.id,
      serviceId: service.id,
      status: "ACTIVE",
      previousRentalStatus: previousRentalStatus as
        | "DRAFT"
        | "PENDING_APPROVAL"
        | "ACTIVE"
        | "ON_HOLD"
        | "COMPLETED"
        | "TERMINATED"
        | "CANCELLED",
      pausedAt: at,
      reason,
      pausedById: actor.userId,
    },
  });

  await logAudit({
    ...actor,
    action: "PAUSE",
    resource: "Rental",
    resourceId: rental.id,
    oldData: { status: previousRentalStatus },
    newData: { status: rental.status === "ACTIVE" ? "ON_HOLD" : rental.status },
    summary: `${actor.userName} paused rental ${rental.rentalNumber} for service ${service.serviceNumber}.`,
    db: tx,
    throwOnError: true,
  });

  return pause;
}

async function resumeRentalForService(
  tx: Tx,
  service: { id: string; serviceNumber: string; rentalId: string | null },
  at: Date,
  actor: AuditActor,
  reason: string
) {
  if (!service.rentalId) return null;

  const pause = await tx.rentalPause.findUnique({
    where: { serviceId: service.id },
    select: {
      id: true,
      status: true,
      rentalId: true,
      previousRentalStatus: true,
    },
  });
  if (!pause || pause.status !== "ACTIVE") return null;

  await tx.rentalPause.update({
    where: { id: pause.id },
    data: {
      status: "RESUMED",
      resumedAt: at,
      resumedById: actor.userId,
    },
  });

  const rental = await tx.rental.findUnique({
    where: { id: pause.rentalId },
    select: { id: true, rentalNumber: true, status: true, version: true },
  });

  if (
    rental &&
    pause.previousRentalStatus === "ACTIVE" &&
    rental.status === "ON_HOLD"
  ) {
    const updated = await tx.rental.updateMany({
      where: { id: rental.id, status: "ON_HOLD", version: rental.version },
      data: { status: "ACTIVE", version: { increment: 1 } },
    });
    if (updated.count === 0) {
      throw new AppError(
        "Rental was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }

    await logAudit({
      ...actor,
      action: "RESUME",
      resource: "Rental",
      resourceId: rental.id,
      oldData: { status: "ON_HOLD" },
      newData: { status: "ACTIVE" },
      summary: `${actor.userName} resumed rental ${rental.rentalNumber} after service ${service.serviceNumber}.`,
      db: tx,
      throwOnError: true,
    });
  }

  return pause;
}

async function moveVehicleForService(
  tx: Tx,
  input: {
    vehicleId: string;
    targetStatus: "IN_SERVICE" | "IDLE" | "DEPLOYED" | "UNDER_REPAIR";
    reason: string;
    actor: AuditActor;
    expectedStatus?:
      | "IDLE"
      | "DEPLOYED"
      | "IN_SERVICE"
      | "UNDER_REPAIR"
      | "OUT_OF_SERVICE"
      | "RETIRED";
    expectedVersion?: number;
    previousVehicleStatus?: string | null;
  }
) {
  const vehicle = await tx.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: { id: true, registrationNumber: true, status: true, version: true },
  });
  if (!vehicle) {
    throw new AppError("Vehicle not found", 404, ErrorCode.NOT_FOUND);
  }

  const target =
    input.previousVehicleStatus === "IN_SERVICE" ||
    input.previousVehicleStatus === "UNDER_REPAIR" ||
    input.previousVehicleStatus === "OUT_OF_SERVICE"
      ? "IDLE"
      : (input.previousVehicleStatus as typeof input.targetStatus | null) ??
        input.targetStatus;

  if (vehicle.status === target) return vehicle;

  const updated = await tx.vehicle.updateMany({
    where: {
      id: vehicle.id,
      status: input.expectedStatus ?? vehicle.status,
      version: input.expectedVersion ?? vehicle.version,
      deletedAt: null,
    },
    data: {
      status: target,
      statusChangedAt: new Date(),
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    throw new AppError(
      "Vehicle status was modified concurrently; please retry",
      409,
      ErrorCode.CONFLICT
    );
  }

  await logAudit({
    ...input.actor,
    action: "UPDATE",
    resource: "Vehicle",
    resourceId: vehicle.id,
    oldData: { status: vehicle.status },
    newData: { status: target },
    summary: `${input.actor.userName} moved vehicle ${vehicle.registrationNumber} from ${vehicle.status} to ${target}: ${input.reason}.`,
    db: tx,
    throwOnError: true,
  });

  return { ...vehicle, status: target };
}

async function restoreVehicleAfterService(
  tx: Tx,
  service: {
    id: string;
    vehicleId: string;
    previousVehicleStatus: string | null;
    serviceNumber: string;
  },
  actor: AuditActor,
  reason: string
) {
  const otherActive = await tx.service.count({
    where: {
      vehicleId: service.vehicleId,
      id: { not: service.id },
      downtimeStart: { not: null },
      downtimeEnd: null,
    },
  });
  if (otherActive > 0) return null;

  return moveVehicleForService(tx, {
    vehicleId: service.vehicleId,
    targetStatus: "IDLE",
    previousVehicleStatus: service.previousVehicleStatus,
    reason,
    actor,
  });
}

export async function createService(
  input: CreateServiceInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const vehicle = await assertVehicle(tx, input.vehicleId, true);
      const rental = input.rentalId
        ? await assertRental(tx, input.rentalId)
        : null;

      if (rental) {
        const activeAssignment = await tx.vehicleDeployment.count({
          where: {
            rentalId: rental.id,
            vehicleId: vehicle.id,
            status: "ACTIVE",
          },
        });
        if (activeAssignment === 0) {
          throw new AppError(
            "Vehicle is not actively assigned to the selected rental",
            409,
            ErrorCode.CONFLICT
          );
        }
      }

      if (input.assignedToId) {
        const assignee = await tx.user.findUnique({
          where: { id: input.assignedToId },
          select: { id: true, status: true },
        });
        if (!assignee || assignee.status !== "ACTIVE") {
          throw new AppError(
            "Assigned user not found or inactive",
            404,
            ErrorCode.NOT_FOUND
          );
        }
      }

      const reportedAt = input.reportedAt ?? new Date();
      const service = await tx.service.create({
        data: {
          serviceNumber: generateServiceNumber(),
          vehicleId: vehicle.id,
          rentalId: rental?.id ?? null,
          serviceType: input.serviceType,
          status: "REPORTED",
          description: input.description ?? null,
          diagnosis: input.diagnosis ?? null,
          assignedToId: input.assignedToId ?? null,
          reportedById: actor.userId,
          reportedAt,
          statusChangedAt: reportedAt,
          downtimeReason: input.downtimeReason ?? null,
          previousVehicleStatus: vehicle.status,
        },
        select: serviceDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Service",
        resourceId: service.id,
        newData: {
          serviceNumber: service.serviceNumber,
          vehicleId: service.vehicleId,
          rentalId: service.rentalId,
          serviceType: service.serviceType,
        },
        summary: `${actor.userName} reported service ${service.serviceNumber} for vehicle ${vehicle.registrationNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return service;
    });
  } catch (err) {
    rethrowPrismaError(err, "Service order could not be created");
  }
}

export async function listServices(query: ListServicesQuery) {
  const { page, limit, search } = query;
  const where: Prisma.ServiceWhereInput = {};

  if (query.status) where.status = query.status;
  if (query.serviceType) where.serviceType = query.serviceType;
  if (query.vehicleId) where.vehicleId = query.vehicleId;
  if (query.rentalId) where.rentalId = query.rentalId;
  if (query.responsibleParty) {
    where.responsibleParty = query.responsibleParty;
  }
  if (query.from || query.to) {
    where.reportedAt = {};
    if (query.from) where.reportedAt.gte = query.from;
    if (query.to) where.reportedAt.lte = query.to;
  }
  if (search) {
    where.OR = [
      { serviceNumber: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { vehicle: { registrationNumber: { contains: search, mode: "insensitive" } } },
      { rental: { rentalNumber: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.ServiceOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where,
      select: serviceListSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.service.count({ where }),
  ]);

  return {
    services,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export function summarizeServiceCost(
  service: {
    charges: Array<{
      costAmount: Prisma.Decimal;
      billableAmount: Prisma.Decimal;
      status: string;
      chargeType: string;
    }>;
    spares: Array<{ lineCost: Prisma.Decimal; quantity: number }>;
    downtimeStart?: Date | null;
    downtimeEnd?: Date | null;
  }
) {
  const totalCost = service.charges.reduce(
    (acc, charge) => acc.add(money(charge.costAmount)),
    new Prisma.Decimal(0)
  );

  const returnCredits = service.spares
    .filter((line) => line.quantity < 0)
    .reduce((acc, line) => acc.add(money(line.lineCost)), new Prisma.Decimal(0));

  const netCost = totalCost.add(returnCredits);
  const billable = service.charges.reduce(
    (acc, charge) => acc.add(money(charge.billableAmount)),
    new Prisma.Decimal(0)
  );

  const statusTotals = new Map<string, Prisma.Decimal>();
  const typeTotals = new Map<string, Prisma.Decimal>();
  for (const charge of service.charges) {
    statusTotals.set(
      charge.status,
      (statusTotals.get(charge.status) ?? new Prisma.Decimal(0)).add(
        money(charge.billableAmount)
      )
    );
    typeTotals.set(
      charge.chargeType,
      (typeTotals.get(charge.chargeType) ?? new Prisma.Decimal(0)).add(
        money(charge.costAmount)
      )
    );
  }

  const byStatus = Object.fromEntries(
    [...statusTotals].map(([key, value]) => [
      key,
      value.toDecimalPlaces(2).toString(),
    ])
  );
  const byType = Object.fromEntries(
    [...typeTotals].map(([key, value]) => [
      key,
      value.toDecimalPlaces(2).toString(),
    ])
  );

  let downtimeMinutes: number | null = null;
  if (service.downtimeStart) {
    const end = service.downtimeEnd ?? new Date();
    downtimeMinutes = Math.max(
      0,
      Math.round((end.getTime() - service.downtimeStart.getTime()) / 60000)
    );
  }

  return {
    totalCost: netCost.toDecimalPlaces(2).toString(),
    totalBillable: billable.toDecimalPlaces(2).toString(),
    returnCredits: returnCredits.neg().toDecimalPlaces(2).toString(),
    byType,
    byStatus,
    downtimeMinutes,
    isDowntimeActive: Boolean(service.downtimeStart && !service.downtimeEnd),
  };
}

export async function getServiceById(id: string) {
  const service = await prisma.service.findUnique({
    where: { id },
    select: serviceDetailSelect,
  });
  if (!service) {
    throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
  }

  return { service, costSummary: summarizeServiceCost(service) };
}

export async function updateService(
  id: string,
  input: UpdateServiceInput,
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.service.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
    }
    if (isTerminal(existing.status)) {
      throw new AppError(
        `Cannot update a ${existing.status} service order`,
        409,
        ErrorCode.CONFLICT
      );
    }

    if (input.assignedToId) {
      const assignee = await tx.user.findUnique({
        where: { id: input.assignedToId },
        select: { id: true, status: true },
      });
      if (!assignee || assignee.status !== "ACTIVE") {
        throw new AppError(
          "Assigned user not found or inactive",
          404,
          ErrorCode.NOT_FOUND
        );
      }
    }

    const data: Prisma.ServiceUncheckedUpdateInput = {
      version: { increment: 1 },
    };
    if (input.description !== undefined) data.description = input.description;
    if (input.diagnosis !== undefined) data.diagnosis = input.diagnosis;
    if (input.repairNotes !== undefined) data.repairNotes = input.repairNotes;
    if (input.resolutionNotes !== undefined) {
      data.resolutionNotes = input.resolutionNotes;
    }
    if (input.assignedToId !== undefined) {
      data.assignedToId = input.assignedToId;
    }
    if (input.downtimeReason !== undefined) {
      data.downtimeReason = input.downtimeReason;
    }

    const updated = await tx.service.updateMany({
      where: { id, version: existing.version },
      data,
    });
    if (updated.count === 0) {
      throw new AppError(
        "Service order was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }

    const service = await tx.service.findUniqueOrThrow({
      where: { id },
      select: serviceDetailSelect,
    });

    await logAudit({
      ...actor,
      action: "UPDATE",
      resource: "Service",
      resourceId: id,
      oldData: existing,
      newData: service,
      summary: `${actor.userName} updated service ${service.serviceNumber}.`,
      db: tx,
      throwOnError: true,
    });

    return { service, costSummary: summarizeServiceCost(service) };
  });
}

export async function startService(
  id: string,
  input: StartServiceInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: { id },
        select: {
          id: true,
          serviceNumber: true,
          status: true,
          vehicleId: true,
          rentalId: true,
          previousVehicleStatus: true,
          downtimeStart: true,
          version: true,
        },
      });
      if (!service) {
        throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
      }

      const allowed = SERVICE_STATUS_TRANSITIONS[service.status] as readonly string[];
      if (!allowed.includes("IN_PROGRESS")) {
        throw new AppError(
          `Service cannot be started from status ${service.status}`,
          409,
          ErrorCode.CONFLICT
        );
      }

      await assertNoOtherActiveDowntime(tx, service.vehicleId, service.id);

      const startedAt = input.startedAt ?? new Date();
      const vehicle = await assertVehicle(tx, service.vehicleId, true);

      const updated = await tx.service.updateMany({
        where: { id, version: service.version },
        data: {
          status: "IN_PROGRESS",
          statusChangedAt: startedAt,
          startedAt,
          downtimeStart: startedAt,
          downtimeReason: input.reason ?? undefined,
          previousVehicleStatus:
            service.downtimeStart === null
              ? vehicle.status
              : service.previousVehicleStatus ?? vehicle.status,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw new AppError(
          "Service order was modified concurrently; please retry",
          409,
          ErrorCode.CONFLICT
        );
      }

      await moveVehicleForService(tx, {
        vehicleId: service.vehicleId,
        targetStatus: "IN_SERVICE",
        expectedStatus: vehicle.status,
        expectedVersion: vehicle.version,
        reason: input.reason ?? `Service ${service.serviceNumber} started`,
        actor,
      });

      await pauseRentalForService(
        tx,
        service,
        startedAt,
        actor,
        input.reason ?? `Vehicle downtime for service ${service.serviceNumber}`
      );

      await logAudit({
        ...actor,
        action: "START",
        resource: "Service",
        resourceId: service.id,
        oldData: { status: service.status },
        newData: {
          status: "IN_PROGRESS",
          startedAt,
          downtimeStart: startedAt,
        },
        summary: `${actor.userName} started service ${service.serviceNumber}.`,
        db: tx,
        throwOnError: true,
      });

      const refreshed = await tx.service.findUniqueOrThrow({
        where: { id },
        select: serviceDetailSelect,
      });
      return { service: refreshed, costSummary: summarizeServiceCost(refreshed) };
    });
  } catch (err) {
    rethrowPrismaError(err, "Service could not be started");
  }
}

export async function markServiceAwaitingParts(
  id: string,
  input: AwaitPartsInput,
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({
      where: { id },
      select: {
        id: true,
        serviceNumber: true,
        status: true,
        version: true,
      },
    });
    if (!service) {
      throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
    }

    const allowed = SERVICE_STATUS_TRANSITIONS[service.status] as readonly string[];
    if (!allowed.includes("AWAITING_PARTS")) {
      throw new AppError(
        `Service cannot await parts from status ${service.status}`,
        409,
        ErrorCode.CONFLICT
      );
    }

    const updated = await tx.service.updateMany({
      where: { id, version: service.version },
      data: {
        status: "AWAITING_PARTS",
        statusChangedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        "Service order was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }

    await logAudit({
      ...actor,
      action: "AWAIT_PARTS",
      resource: "Service",
      resourceId: service.id,
      oldData: { status: service.status },
      newData: { status: "AWAITING_PARTS", notes: input.notes ?? null },
      summary: `${actor.userName} marked service ${service.serviceNumber} as awaiting parts.`,
      db: tx,
      throwOnError: true,
    });

    const refreshed = await tx.service.findUniqueOrThrow({
      where: { id },
      select: serviceDetailSelect,
    });
    return { service: refreshed, costSummary: summarizeServiceCost(refreshed) };
  });
}

export async function resumeServiceWork(
  id: string,
  input: ResumeServiceInput,
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({
      where: { id },
      select: {
        id: true,
        serviceNumber: true,
        status: true,
        version: true,
      },
    });
    if (!service) {
      throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
    }

    const allowed = SERVICE_STATUS_TRANSITIONS[service.status] as readonly string[];
    if (!allowed.includes("IN_PROGRESS")) {
      throw new AppError(
        `Service work cannot resume from status ${service.status}`,
        409,
        ErrorCode.CONFLICT
      );
    }

    const updated = await tx.service.updateMany({
      where: { id, version: service.version },
      data: {
        status: "IN_PROGRESS",
        statusChangedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        "Service order was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }

    await logAudit({
      ...actor,
      action: "RESUME",
      resource: "Service",
      resourceId: service.id,
      oldData: { status: service.status },
      newData: { status: "IN_PROGRESS", notes: input.notes ?? null },
      summary: `${actor.userName} resumed service ${service.serviceNumber}.`,
      db: tx,
      throwOnError: true,
    });

    const refreshed = await tx.service.findUniqueOrThrow({
      where: { id },
      select: serviceDetailSelect,
    });
    return { service: refreshed, costSummary: summarizeServiceCost(refreshed) };
  });
}

export async function completeService(
  id: string,
  input: CompleteServiceInput,
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({
      where: { id },
      select: {
        id: true,
        serviceNumber: true,
        status: true,
        vehicleId: true,
        rentalId: true,
        previousVehicleStatus: true,
        startedAt: true,
        downtimeStart: true,
        version: true,
      },
    });
    if (!service) {
      throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
    }

    const allowed = SERVICE_STATUS_TRANSITIONS[service.status] as readonly string[];
    if (!allowed.includes("COMPLETED")) {
      throw new AppError(
        `Service cannot be completed from status ${service.status}`,
        409,
        ErrorCode.CONFLICT
      );
    }

    const completedAt = input.completedAt ?? new Date();
    if (
      service.startedAt &&
      completedAt.getTime() < service.startedAt.getTime()
    ) {
      throw new AppError(
        "completedAt cannot be before the service start",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    const updated = await tx.service.updateMany({
      where: { id, version: service.version },
      data: {
        status: "COMPLETED",
        statusChangedAt: completedAt,
        completedAt,
        downtimeEnd: completedAt,
        ...(input.repairNotes !== undefined
          ? { repairNotes: input.repairNotes }
          : {}),
        ...(input.resolutionNotes !== undefined
          ? { resolutionNotes: input.resolutionNotes }
          : {}),
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        "Service order was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }

    await resumeRentalForService(
      tx,
      service,
      completedAt,
      actor,
      input.reason ?? `Service ${service.serviceNumber} completed`
    );

    await restoreVehicleAfterService(
      tx,
      service,
      actor,
      `Service ${service.serviceNumber} completed`
    );

    await logAudit({
      ...actor,
      action: "COMPLETE",
      resource: "Service",
      resourceId: service.id,
      oldData: { status: service.status },
      newData: { status: "COMPLETED", completedAt, downtimeEnd: completedAt },
      summary: `${actor.userName} completed service ${service.serviceNumber}.`,
      db: tx,
      throwOnError: true,
    });

    const refreshed = await tx.service.findUniqueOrThrow({
      where: { id },
      select: serviceDetailSelect,
    });
    return { service: refreshed, costSummary: summarizeServiceCost(refreshed) };
  });
}

export async function closeService(
  id: string,
  input: CloseServiceInput,
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({
      where: { id },
      select: {
        id: true,
        serviceNumber: true,
        status: true,
        version: true,
      },
    });
    if (!service) {
      throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
    }

    const allowed = SERVICE_STATUS_TRANSITIONS[service.status] as readonly string[];
    if (!allowed.includes("CLOSED")) {
      throw new AppError(
        `Service cannot be closed from status ${service.status}`,
        409,
        ErrorCode.CONFLICT
      );
    }

    const closedAt = new Date();
    const updated = await tx.service.updateMany({
      where: { id, version: service.version },
      data: {
        status: "CLOSED",
        statusChangedAt: closedAt,
        closedAt,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        "Service order was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }

    await logAudit({
      ...actor,
      action: "CLOSE",
      resource: "Service",
      resourceId: service.id,
      oldData: { status: service.status },
      newData: { status: "CLOSED", closedAt },
      summary: `${actor.userName} closed service ${service.serviceNumber}.`,
      db: tx,
      throwOnError: true,
    });

    const refreshed = await tx.service.findUniqueOrThrow({
      where: { id },
      select: serviceDetailSelect,
    });
    return { service: refreshed, costSummary: summarizeServiceCost(refreshed) };
  });
}

export async function cancelService(
  id: string,
  input: CancelServiceInput,
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({
      where: { id },
      select: {
        id: true,
        serviceNumber: true,
        status: true,
        vehicleId: true,
        rentalId: true,
        previousVehicleStatus: true,
        downtimeStart: true,
        version: true,
      },
    });
    if (!service) {
      throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
    }

    const allowed = SERVICE_STATUS_TRANSITIONS[service.status] as readonly string[];
    if (!allowed.includes("CANCELLED")) {
      throw new AppError(
        `Service cannot be cancelled from status ${service.status}`,
        409,
        ErrorCode.CONFLICT
      );
    }

    const cancelledAt = new Date();
    const updated = await tx.service.updateMany({
      where: { id, version: service.version },
      data: {
        status: "CANCELLED",
        statusChangedAt: cancelledAt,
        cancelledAt,
        cancellationReason: input.reason,
        downtimeEnd: service.downtimeStart ? cancelledAt : null,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        "Service order was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }

    await resumeRentalForService(
      tx,
      service,
      cancelledAt,
      actor,
      `Service ${service.serviceNumber} cancelled`
    );

    if (service.downtimeStart) {
      await restoreVehicleAfterService(
        tx,
        service,
        actor,
        `Service ${service.serviceNumber} cancelled`
      );
    }

    await logAudit({
      ...actor,
      action: "CANCEL",
      resource: "Service",
      resourceId: service.id,
      oldData: { status: service.status },
      newData: { status: "CANCELLED", cancellationReason: input.reason },
      summary: `${actor.userName} cancelled service ${service.serviceNumber}: ${input.reason}`,
      db: tx,
      throwOnError: true,
    });

    const refreshed = await tx.service.findUniqueOrThrow({
      where: { id },
      select: serviceDetailSelect,
    });
    return { service: refreshed, costSummary: summarizeServiceCost(refreshed) };
  });
}

export async function approveServiceResponsibility(
  id: string,
  input: ApproveResponsibilityInput,
  actor: AuditActor
) {
  if (!RESPONSIBILITY_APPROVER_ROLES.includes(actor.userRole)) {
    throw new AppError(
      "Only ADMIN or SUPERVISOR users can approve service responsibility",
      403,
      ErrorCode.FORBIDDEN
    );
  }

  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({
      where: { id },
      select: {
        id: true,
        serviceNumber: true,
        status: true,
        responsibleParty: true,
        version: true,
      },
    });
    if (!service) {
      throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
    }
    if (isTerminal(service.status)) {
      throw new AppError(
        `Responsibility cannot be approved for a ${service.status} service order`,
        409,
        ErrorCode.CONFLICT
      );
    }

    const approvedAt = new Date();
    const updated = await tx.service.updateMany({
      where: { id, version: service.version },
      data: {
        responsibleParty: input.responsibility,
        responsibilityApprovedAt: approvedAt,
        responsibilityInvestigationNotes: input.investigationNotes,
        ...(input.evidence !== undefined
          ? {
              responsibilityEvidence:
                input.evidence === null
                  ? Prisma.JsonNull
                  : (input.evidence as Prisma.InputJsonValue),
            }
          : {}),
        approvedById: actor.userId,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        "Service order was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }

    const charges = await tx.serviceCharge.findMany({
      where: {
        serviceId: service.id,
        status: { notIn: ["COLLECTED", "WAIVED"] },
      },
      select: { id: true, costAmount: true },
    });

    for (const charge of charges) {
      const allocation = deriveServiceChargeAllocation({
        responsibility: input.responsibility,
        amount: charge.costAmount,
      });
      await tx.serviceCharge.update({
        where: { id: charge.id },
        data: {
          recoverableFrom: allocation.recoverableFrom as
            | "AML"
            | "RIDER"
            | "CLIENT"
            | "THIRD_PARTY"
            | "INSURANCE"
            | "UNKNOWN",
          billableAmount: allocation.billableAmount,
          status: allocation.status,
        },
      });
    }

    await logAudit({
      ...actor,
      action: "APPROVE",
      resource: "Service",
      resourceId: service.id,
      oldData: { responsibleParty: service.responsibleParty },
      newData: {
        responsibleParty: input.responsibility,
        investigationNotes: input.investigationNotes,
        chargesReallocated: charges.length,
      },
      summary: `${actor.userName} approved responsibility for service ${service.serviceNumber} as ${input.responsibility}.`,
      db: tx,
      throwOnError: true,
    });

    const refreshed = await tx.service.findUniqueOrThrow({
      where: { id },
      select: serviceDetailSelect,
    });
    return { service: refreshed, costSummary: summarizeServiceCost(refreshed) };
  });
}

export async function assignReplacement(
  id: string,
  input: AssignReplacementInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: { id },
        select: {
          id: true,
          serviceNumber: true,
          status: true,
          vehicleId: true,
          rentalId: true,
          rental: {
            select: {
              id: true,
              rentalNumber: true,
              status: true,
              riderId: true,
              clientId: true,
            },
          },
        },
      });
      if (!service) {
        throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
      }
      if (isTerminal(service.status)) {
        throw new AppError(
          `Replacement cannot be assigned for a ${service.status} service order`,
          409,
          ErrorCode.CONFLICT
        );
      }

      if (input.replacementVehicleId === service.vehicleId) {
        throw new AppError(
          "Replacement vehicle must be different from the vehicle under service",
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }

      const replacementVehicle = await assertVehicle(
        tx,
        input.replacementVehicleId,
        true
      );

      if (replacementVehicle.status !== "IDLE") {
        throw new AppError(
          `Replacement vehicle must be IDLE (current status: ${replacementVehicle.status})`,
          409,
          ErrorCode.CONFLICT
        );
      }

      const activeForService = await tx.replacementAssignment.count({
        where: { serviceId: service.id, status: "ACTIVE" },
      });
      if (activeForService > 0) {
        throw new AppError(
          "Service already has an active replacement vehicle",
          409,
          ErrorCode.CONFLICT
        );
      }

      const activeForVehicle = await tx.replacementAssignment.count({
        where: { replacementVehicleId: replacementVehicle.id, status: "ACTIVE" },
      });
      if (activeForVehicle > 0) {
        throw new AppError(
          "Replacement vehicle already has an active replacement assignment",
          409,
          ErrorCode.CONFLICT
        );
      }

      let replacementRental = null;
      if (input.replacementRentalId) {
        replacementRental = await assertRental(tx, input.replacementRentalId);
        if (replacementRental.id === service.rentalId) {
          throw new AppError(
            "replacementRentalId must reference a different rental from the original",
            400,
            ErrorCode.VALIDATION_ERROR
          );
        }
      }

      const assignedAt = input.assignedAt ?? new Date();
      const assignment = await tx.replacementAssignment.create({
        data: {
          serviceId: service.id,
          originalVehicleId: service.vehicleId,
          replacementVehicleId: replacementVehicle.id,
          rentalId: service.rentalId,
          replacementRentalId: replacementRental?.id ?? null,
          riderId:
            input.riderId ?? replacementRental?.riderId ?? service.rental?.riderId ?? null,
          clientId:
            input.clientId ??
            replacementRental?.clientId ??
            service.rental?.clientId ??
            null,
          status: "ACTIVE",
          assignedAt,
          assignedById: actor.userId,
          reason: input.reason ?? null,
          notes: input.notes ?? null,
        },
        select: replacementAssignmentSelect,
      });

      await tx.service.update({
        where: { id: service.id },
        data: {
          replacementVehicleId: replacementVehicle.id,
          version: { increment: 1 },
        },
      });

      await moveVehicleForService(tx, {
        vehicleId: replacementVehicle.id,
        targetStatus: "DEPLOYED",
        expectedStatus: "IDLE",
        expectedVersion: replacementVehicle.version,
        reason: input.reason ?? `Replacement for service ${service.serviceNumber}`,
        actor,
      });

      await logAudit({
        ...actor,
        action: "ASSIGN_REPLACEMENT",
        resource: "Service",
        resourceId: service.id,
        newData: {
          serviceNumber: service.serviceNumber,
          replacementAssignmentId: assignment.id,
          replacementVehicleId: replacementVehicle.id,
          replacementRentalId: replacementRental?.id ?? null,
        },
        summary: `${actor.userName} assigned replacement vehicle ${replacementVehicle.registrationNumber} for service ${service.serviceNumber}.`,
        db: tx,
        throwOnError: true,
      });

      const refreshed = await tx.service.findUniqueOrThrow({
        where: { id },
        select: serviceDetailSelect,
      });
      return { service: refreshed, replacementAssignment: assignment };
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A replacement vehicle is already active for this service or vehicle"
    );
  }
}

export async function returnReplacement(
  id: string,
  input: ReturnReplacementInput,
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.service.findUnique({
      where: { id },
      select: {
        id: true,
        serviceNumber: true,
        status: true,
        responsibleParty: true,
      },
    });
    if (!service) {
      throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
    }
    if (isTerminal(service.status)) {
      throw new AppError(
        `Replacement cannot be returned for a ${service.status} service order`,
        409,
        ErrorCode.CONFLICT
      );
    }

    const assignment = await tx.replacementAssignment.findFirst({
      where: { serviceId: service.id, status: "ACTIVE" },
      select: {
        id: true,
        replacementVehicleId: true,
        replacementRentalId: true,
        assignedAt: true,
      },
    });
    if (!assignment) {
      throw new AppError(
        "Service has no active replacement assignment",
        409,
        ErrorCode.CONFLICT
      );
    }

    const returnedAt = input.returnedAt ?? new Date();
    if (returnedAt.getTime() < assignment.assignedAt.getTime()) {
      throw new AppError(
        "returnedAt cannot be before the replacement assignment",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    const updated = await tx.replacementAssignment.updateMany({
      where: { id: assignment.id, status: "ACTIVE" },
      data: {
        status: "COMPLETED",
        returnedAt,
        returnedById: actor.userId,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    if (updated.count === 0) {
      throw new AppError(
        "Replacement assignment was modified concurrently; please retry",
        409,
        ErrorCode.CONFLICT
      );
    }

    const vehicle = await tx.vehicle.findUnique({
      where: { id: assignment.replacementVehicleId },
      select: { id: true, status: true, version: true, registrationNumber: true },
    });

    if (vehicle && vehicle.status === "DEPLOYED") {
      const vehicleUpdated = await tx.vehicle.updateMany({
        where: {
          id: vehicle.id,
          status: "DEPLOYED",
          version: vehicle.version,
          deletedAt: null,
        },
        data: {
          status: "IDLE",
          statusChangedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (vehicleUpdated.count === 0) {
        throw new AppError(
          "Vehicle status was modified concurrently; please retry",
          409,
          ErrorCode.CONFLICT
        );
      }
    }

    let replacementCharge = null;
    if (assignment.replacementRentalId) {
      const replacementRental = await tx.rental.findUnique({
        where: { id: assignment.replacementRentalId },
        select: {
          id: true,
          rentalNumber: true,
          collectionPeriod: true,
          currency: true,
          dailyRate: true,
          weeklyRate: true,
          fortnightlyRate: true,
          monthlyRate: true,
        },
      });

      if (replacementRental) {
        const idempotencyKey = `replacement-charge:${assignment.id}`;
        const existingCharge = await tx.serviceCharge.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        });

        if (!existingCharge) {
          const amount = calculateDueAmount({
            period: replacementRental.collectionPeriod,
            periodStart: assignment.assignedAt,
            periodEnd: returnedAt,
            rates: {
              dailyRate: replacementRental.dailyRate,
              weeklyRate: replacementRental.weeklyRate,
              fortnightlyRate: replacementRental.fortnightlyRate,
              monthlyRate: replacementRental.monthlyRate,
            },
          });

          if (amount.gt(0)) {
            const allocation = deriveServiceChargeAllocation({
              responsibility: service.responsibleParty,
              amount,
            });
            replacementCharge = await tx.serviceCharge.create({
              data: {
                serviceId: service.id,
                chargeType: "REPLACEMENT_RENT",
                costAmount: amount,
                billableAmount: allocation.billableAmount,
                recoverableFrom: allocation.recoverableFrom as
                  | "AML"
                  | "RIDER"
                  | "CLIENT"
                  | "THIRD_PARTY"
                  | "INSURANCE"
                  | "UNKNOWN",
                status: allocation.status,
                currency: replacementRental.currency,
                description: `Replacement rental ${replacementRental.rentalNumber} from ${assignment.assignedAt
                  .toISOString()
                  .slice(0, 10)} to ${returnedAt.toISOString().slice(0, 10)}`,
                sourceType: "ReplacementAssignment",
                sourceId: assignment.id,
                idempotencyKey,
              },
              select: serviceChargeSelect,
            });
          }
        }
      }
    }

    await tx.service.updateMany({
      where: { id: service.id, replacementVehicleId: assignment.replacementVehicleId },
      data: { replacementVehicleId: null, version: { increment: 1 } },
    });

    await logAudit({
      ...actor,
      action: "RETURN_REPLACEMENT",
      resource: "Service",
      resourceId: service.id,
      newData: {
        serviceNumber: service.serviceNumber,
        replacementAssignmentId: assignment.id,
        returnedAt,
      },
      summary: `${actor.userName} returned replacement vehicle for service ${service.serviceNumber}.`,
      db: tx,
      throwOnError: true,
    });

    const refreshed = await tx.service.findUniqueOrThrow({
      where: { id },
      select: serviceDetailSelect,
    });
    return { service: refreshed, replacementCharge };
  });
}

export async function createServiceCharge(
  id: string,
  input: CreateServiceChargeInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: { id },
        select: {
          id: true,
          serviceNumber: true,
          status: true,
          responsibleParty: true,
        },
      });
      if (!service) {
        throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
      }
      if (isTerminal(service.status)) {
        throw new AppError(
          `Charges cannot be added to a ${service.status} service order`,
          409,
          ErrorCode.CONFLICT
        );
      }

      if (input.idempotencyKey) {
        const existing = await tx.serviceCharge.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
          select: serviceChargeSelect,
        });
        if (existing) {
          return { charge: existing, duplicate: true };
        }
      }

      const costAmount = new Prisma.Decimal(input.costAmount);
      const allocation = deriveServiceChargeAllocation({
        responsibility: service.responsibleParty,
        amount: costAmount,
      });

      const charge = await tx.serviceCharge.create({
        data: {
          serviceId: service.id,
          chargeType: input.chargeType,
          costAmount,
          billableAmount: allocation.billableAmount,
          recoverableFrom: allocation.recoverableFrom as
            | "AML"
            | "RIDER"
            | "CLIENT"
            | "THIRD_PARTY"
            | "INSURANCE"
            | "UNKNOWN",
          status: allocation.status,
          description: input.description ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          sourceType: "Manual",
          sourceId: service.id,
        },
        select: serviceChargeSelect,
      });

      await logAudit({
        ...actor,
        action: "CHARGE",
        resource: "Service",
        resourceId: service.id,
        newData: {
          serviceNumber: service.serviceNumber,
          chargeId: charge.id,
          chargeType: charge.chargeType,
          costAmount: charge.costAmount.toString(),
          billableAmount: charge.billableAmount.toString(),
          recoverableFrom: charge.recoverableFrom,
        },
        summary: `${actor.userName} added ${input.chargeType} charge to service ${service.serviceNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return { charge, duplicate: false };
    });
  } catch (err) {
    rethrowPrismaError(err, "Service charge could not be created");
  }
}
