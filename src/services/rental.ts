import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { assertHubAccess, resolveHubFilter } from "../utils/scope.js";
import type { UserContext } from "../types/user.js";
import { resolveRentalPricing } from "./rental-pricing.js";
import {
  getDepositBalanceByRental,
  getOrCreateDepositForRental,
  recordDepositTransaction,
} from "./ledger.js";
import {
  generateRentalDues,
  getRentalFinancialSummary,
  recordRentAdjustment,
} from "./rental-dues.js";
import { toDecimal } from "./rental-schedule.js";
import type {
  ActivateRentalInput,
  AssignVehicleInput,
  CloseRentalInput,
  CreateRentalInput,
  ListRentalsQuery,
} from "../validation/rental.js";

type Tx = Prisma.TransactionClient;

export const RENTAL_STATUS_TRANSITIONS = {
  DRAFT: ["PENDING_APPROVAL", "ACTIVE", "CANCELLED"],
  PENDING_APPROVAL: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "TERMINATED"],
  ON_HOLD: ["ACTIVE", "TERMINATED"],
  COMPLETED: [],
  TERMINATED: [],
  CANCELLED: [],
} as const;

const CLOSED_RENTAL_STATUSES = ["COMPLETED", "TERMINATED", "CANCELLED"];

const rentalClientSelect = {
  id: true,
  clientCode: true,
  type: true,
  name: true,
  companyName: true,
} as const;

const rentalRiderSelect = {
  id: true,
  riderCode: true,
  fullName: true,
  phoneNumber: true,
  status: true,
  rentalType: true,
  b2cMode: true,
  b2bRiderMgmt: true,
  clientId: true,
} as const;

const rentalHubSelect = {
  id: true,
  name: true,
  code: true,
  isActive: true,
} as const;

const rentalRateCardSelect = {
  id: true,
  code: true,
  name: true,
  billingFrequency: true,
  currency: true,
  isActive: true,
} as const;

const rentalVehicleSelect = {
  id: true,
  registrationNumber: true,
  make: true,
  model: true,
  status: true,
  version: true,
} as const;

export const rentalListSelect = {
  id: true,
  rentalNumber: true,
  rentalType: true,
  b2cMode: true,
  b2bRiderMgmt: true,
  clientId: true,
  riderId: true,
  hubId: true,
  rateCardId: true,
  startDate: true,
  endDate: true,
  expectedEndDate: true,
  status: true,
  agreementRef: true,
  billingFrequency: true,
  collectionPeriod: true,
  currency: true,
  dailyRate: true,
  weeklyRate: true,
  fortnightlyRate: true,
  monthlyRate: true,
  securityDepositRequired: true,
  version: true,
  notes: true,
  activatedAt: true,
  closedAt: true,
  finalOutstandingAmount: true,
  finalDepositBalance: true,
  createdAt: true,
  updatedAt: true,
  client: { select: rentalClientSelect },
  rider: { select: rentalRiderSelect },
  hub: { select: rentalHubSelect },
  rateCard: { select: rentalRateCardSelect },
} as const;

export const rentalDetailSelect = {
  ...rentalListSelect,
  createdById: true,
  closedById: true,
  settlementSnapshot: true,
  createdBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  assignments: {
    where: { status: "ACTIVE" },
    select: {
      id: true,
      vehicleId: true,
      riderId: true,
      startDate: true,
      endDate: true,
      status: true,
      vehicle: { select: rentalVehicleSelect },
    },
  },
  deposits: {
    select: {
      id: true,
      payerType: true,
      amountRequired: true,
      currency: true,
      status: true,
      dueDate: true,
      version: true,
    },
  },
  _count: {
    select: {
      assignments: true,
      collectionDues: true,
      collections: true,
      rentalLedgerEntries: true,
    },
  },
} as const;

const assignmentSelect = {
  id: true,
  vehicleId: true,
  riderId: true,
  rentalId: true,
  hubId: true,
  assignedById: true,
  startDate: true,
  endDate: true,
  status: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
  vehicle: { select: rentalVehicleSelect },
} as const;

function generateRentalNumber() {
  return `RN-${uuidv4().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function isClosedStatus(status: string) {
  return CLOSED_RENTAL_STATUSES.includes(status);
}

async function assertClient(tx: Tx, rentalType: string, clientId: string) {
  const client = await tx.client.findUnique({
    where: { id: clientId },
    select: { id: true, type: true, isActive: true, deletedAt: true },
  });

  if (!client || client.deletedAt) {
    throw new AppError("Client not found", 404, ErrorCode.NOT_FOUND);
  }
  if (!client.isActive) {
    throw new AppError(
      "Client is inactive and cannot be used for a rental",
      409,
      ErrorCode.CONFLICT
    );
  }
  if (rentalType === "B2B" && client.type !== "CORPORATE") {
    throw new AppError(
      "B2B rentals require a CORPORATE client",
      409,
      ErrorCode.CONFLICT
    );
  }

  return client;
}

async function assertRider(
  tx: Tx,
  input: {
    riderId: string;
    clientId: string;
    rentalType: string;
    b2cMode?: string | null;
    b2bRiderMgmt?: string | null;
  }
) {
  const rider = await tx.rider.findUnique({
    where: { id: input.riderId },
    select: {
      id: true,
      clientId: true,
      status: true,
      rentalType: true,
      b2cMode: true,
      b2bRiderMgmt: true,
      deletedAt: true,
    },
  });

  if (!rider || rider.deletedAt) {
    throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
  }
  if (rider.status !== "ACTIVE") {
    throw new AppError(
      `Rider must be ACTIVE to be used in a rental (current status: ${rider.status})`,
      409,
      ErrorCode.CONFLICT
    );
  }
  if (rider.clientId && rider.clientId !== input.clientId) {
    throw new AppError(
      "Rider does not belong to the selected client",
      409,
      ErrorCode.CONFLICT
    );
  }
  if (rider.rentalType && rider.rentalType !== input.rentalType) {
    throw new AppError(
      "Rider rental classification does not match the rental type",
      409,
      ErrorCode.CONFLICT
    );
  }
  if (
    rider.b2cMode &&
    input.b2cMode &&
    rider.b2cMode !== input.b2cMode
  ) {
    throw new AppError(
      "Rider B2C mode does not match the rental B2C mode",
      409,
      ErrorCode.CONFLICT
    );
  }
  if (
    rider.b2bRiderMgmt &&
    input.b2bRiderMgmt &&
    rider.b2bRiderMgmt !== input.b2bRiderMgmt
  ) {
    throw new AppError(
      "Rider B2B management mode does not match the rental B2B mode",
      409,
      ErrorCode.CONFLICT
    );
  }

  return rider;
}

async function assertHub(tx: Tx, hubId: string) {
  const hub = await tx.hub.findUnique({
    where: { id: hubId },
    select: { id: true, isActive: true },
  });
  if (!hub) {
    throw new AppError("Hub not found", 404, ErrorCode.NOT_FOUND);
  }
  if (!hub.isActive) {
    throw new AppError(
      "Hub is inactive and cannot be used for a rental",
      409,
      ErrorCode.CONFLICT
    );
  }
  return hub;
}

async function assignVehicleWithinTransaction(
  tx: Tx,
  input: {
    rental: {
      id: string;
      rentalNumber: string;
      rentalType: string;
      riderId: string | null;
      hubId: string | null;
      status: string;
    };
    vehicleId: string;
    startDate?: Date;
    reason?: string;
  },
  actor: AuditActor
) {
  if (isClosedStatus(input.rental.status)) {
    throw new AppError(
      `Vehicle cannot be assigned to a ${input.rental.status} rental`,
      409,
      ErrorCode.CONFLICT
    );
  }

  // A B2B agreement may cover multiple vehicles. B2C rentals remain limited
  // to one active vehicle at a time.
  if (input.rental.rentalType !== "B2B") {
    const activeForRental = await tx.vehicleDeployment.count({
      where: { rentalId: input.rental.id, status: "ACTIVE" },
    });
    if (activeForRental > 0) {
      throw new AppError(
        "Rental already has an active vehicle assignment",
        409,
        ErrorCode.CONFLICT
      );
    }
  }

  const vehicle = await tx.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: {
      id: true,
      registrationNumber: true,
      status: true,
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
      "Vehicle is inactive and cannot be assigned",
      409,
      ErrorCode.CONFLICT
    );
  }
  if (vehicle.status !== "IDLE") {
    throw new AppError(
      `Vehicle is not available for assignment (current status: ${vehicle.status})`,
      409,
      ErrorCode.CONFLICT
    );
  }

  const activeForVehicle = await tx.vehicleDeployment.count({
    where: { vehicleId: vehicle.id, status: "ACTIVE" },
  });
  if (activeForVehicle > 0) {
    throw new AppError(
      "Vehicle already has an active assignment",
      409,
      ErrorCode.CONFLICT
    );
  }

  const startDate = input.startDate ?? new Date();
  const assignment = await tx.vehicleDeployment.create({
    data: {
      vehicleId: vehicle.id,
      riderId: input.rental.riderId,
      rentalId: input.rental.id,
      hubId: input.rental.hubId,
      assignedById: actor.userId,
      startDate,
      status: "ACTIVE",
      reason: input.reason ?? null,
    },
    select: assignmentSelect,
  });

  const updatedVehicle = await tx.vehicle.updateMany({
    where: {
      id: vehicle.id,
      status: "IDLE",
      version: vehicle.version,
      deletedAt: null,
    },
    data: {
      status: "DEPLOYED",
      version: { increment: 1 },
    },
  });

  if (updatedVehicle.count === 0) {
    throw new AppError(
      "Vehicle status was modified concurrently; please retry",
      409,
      ErrorCode.CONFLICT
    );
  }

  await tx.vehicleStatusHistory.create({
    data: {
      vehicleId: vehicle.id,
      previousStatus: "IDLE",
      status: "DEPLOYED",
      changedById: actor.userId,
      reason: input.reason ?? `Assigned to rental ${input.rental.rentalNumber}`,
    },
  });

  await logAudit({
    ...actor,
    action: "ASSIGN",
    resource: "Rental",
    resourceId: input.rental.id,
    newData: {
      rentalNumber: input.rental.rentalNumber,
      vehicleId: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      assignmentId: assignment.id,
      startDate,
    },
    summary: `${actor.userName} assigned vehicle ${vehicle.registrationNumber} to rental ${input.rental.rentalNumber}.`,
    db: tx,
    throwOnError: true,
  });

  await logAudit({
    ...actor,
    action: "UPDATE",
    resource: "Vehicle",
    resourceId: vehicle.id,
    oldData: { status: vehicle.status },
    newData: { status: "DEPLOYED", rentalId: input.rental.id },
    summary: `${actor.userName} deployed vehicle ${vehicle.registrationNumber} for rental ${input.rental.rentalNumber}.`,
    db: tx,
    throwOnError: true,
  });

  return assignment;
}

export async function createRental(
  input: CreateRentalInput,
  actor: AuditActor
) {
  try {
    const pricing = await resolveRentalPricing({
      clientId: input.clientId,
      rateCardId: input.rateCardId ?? null,
      effectiveAt: input.startDate,
      manualPricing: input.manualPricing ?? null,
    });

    const billingFrequency =
      input.billingFrequency ?? pricing.billingFrequency ?? null;

    return await prisma.$transaction(async (tx) => {
      await assertClient(tx, input.rentalType, input.clientId);

      if (input.rentalType === "B2B" && !billingFrequency) {
        throw new AppError(
          "billingFrequency is required for B2B rentals (supply it directly or via the ratecard)",
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }

      if (input.riderId) {
        await assertRider(tx, {
          riderId: input.riderId,
          clientId: input.clientId,
          rentalType: input.rentalType,
          b2cMode: input.b2cMode,
          b2bRiderMgmt: input.b2bRiderMgmt,
        });
      }

      if (input.hubId) await assertHub(tx, input.hubId);
      assertHubAccess(actor.user, input.hubId);

      if (input.vehicleId) {
        const vehicle = await tx.vehicle.findUnique({
          where: { id: input.vehicleId },
          select: {
            id: true,
            status: true,
            isActive: true,
            deletedAt: true,
          },
        });
        if (!vehicle || vehicle.deletedAt) {
          throw new AppError("Vehicle not found", 404, ErrorCode.NOT_FOUND);
        }
        if (!vehicle.isActive || vehicle.status !== "IDLE") {
          throw new AppError(
            "Vehicle is not available for assignment",
            409,
            ErrorCode.CONFLICT
          );
        }
      }

      const data: Prisma.RentalUncheckedCreateInput = {
        rentalNumber: generateRentalNumber(),
        rentalType: input.rentalType,
        b2cMode: input.b2cMode ?? null,
        b2bRiderMgmt: input.b2bRiderMgmt ?? null,
        clientId: input.clientId,
        riderId: input.riderId ?? null,
        hubId: input.hubId ?? null,
        rateCardId: pricing.rateCardId,
        startDate: input.startDate,
        expectedEndDate: input.expectedEndDate ?? null,
        status: "DRAFT",
        agreementRef: input.agreementRef ?? null,
        billingFrequency,
        collectionPeriod: input.collectionPeriod,
        currency: input.currency ?? pricing.currency,
        dailyRate: pricing.rates.dailyRate,
        weeklyRate: pricing.rates.weeklyRate,
        fortnightlyRate: pricing.rates.fortnightlyRate,
        monthlyRate: pricing.rates.monthlyRate,
        securityDepositRequired: input.securityDepositAmount,
        createdById: actor.userId,
        notes: input.notes ?? null,
      };

      const rental = await tx.rental.create({
        data,
        select: rentalDetailSelect,
      });

      if (toDecimal(input.securityDepositAmount).gt(0)) {
        await getOrCreateDepositForRental(tx, rental.id);
      }

      if (input.vehicleId) {
        await assignVehicleWithinTransaction(
          tx,
          {
            rental: {
              id: rental.id,
              rentalNumber: rental.rentalNumber,
              rentalType: rental.rentalType,
              riderId: rental.riderId,
              hubId: rental.hubId,
              status: rental.status,
            },
            vehicleId: input.vehicleId,
            startDate: input.startDate,
            reason: "Assigned during rental creation",
          },
          actor
        );
      }

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Rental",
        resourceId: rental.id,
        newData: {
          rentalNumber: rental.rentalNumber,
          rentalType: rental.rentalType,
          clientId: rental.clientId,
          riderId: rental.riderId,
          rateCardId: rental.rateCardId,
          startDate: rental.startDate,
          collectionPeriod: rental.collectionPeriod,
          securityDepositRequired: rental.securityDepositRequired,
        },
        summary: `${actor.userName} created rental ${rental.rentalNumber}.`,
        db: tx,
        throwOnError: true,
      });

      const refreshed = await tx.rental.findUniqueOrThrow({
        where: { id: rental.id },
        select: rentalDetailSelect,
      });

      return refreshed;
    });
  } catch (err) {
    rethrowPrismaError(err, "Rental could not be created");
  }
}

export async function listRentals(query: ListRentalsQuery, user?: UserContext) {
  const { page, limit, search } = query;
  const where: Prisma.RentalWhereInput = {};

  if (query.rentalType) where.rentalType = query.rentalType;
  if (query.status) where.status = query.status;
  if (query.clientId) where.clientId = query.clientId;
  if (query.riderId) where.riderId = query.riderId;
  const scopedHubId = resolveHubFilter(user, query.hubId);
  if (scopedHubId) where.hubId = scopedHubId;
  if (query.collectionPeriod) where.collectionPeriod = query.collectionPeriod;

  if (search) {
    where.OR = [
      { rentalNumber: { contains: search, mode: "insensitive" } },
      { agreementRef: { contains: search, mode: "insensitive" } },
      { client: { name: { contains: search, mode: "insensitive" } } },
      { rider: { fullName: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.RentalOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [rentals, total] = await Promise.all([
    prisma.rental.findMany({
      where,
      select: rentalListSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.rental.count({ where }),
  ]);

  return {
    rentals,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getRentalById(id: string, user?: UserContext) {
  const rental = await prisma.rental.findUnique({
    where: { id },
    select: rentalDetailSelect,
  });

  if (!rental) {
    throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
  }
  assertHubAccess(user, rental.hubId);

  const financialSummary = await prisma.$transaction(async (tx) =>
    getRentalFinancialSummary(tx, id)
  );

  return { rental, financialSummary };
}

export async function assignVehicle(
  id: string,
  input: AssignVehicleInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rental = await tx.rental.findUnique({
        where: { id },
        select: {
          id: true,
          rentalNumber: true,
          rentalType: true,
          riderId: true,
          hubId: true,
          status: true,
        },
      });

      if (!rental) {
        throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
      }

      const assignment = await assignVehicleWithinTransaction(
        tx,
        {
          rental,
          vehicleId: input.vehicleId,
          startDate: input.startDate,
          reason: input.reason,
        },
        actor
      );

      return { assignment };
    });
  } catch (err) {
    rethrowPrismaError(err, "Vehicle could not be assigned");
  }
}

export async function activateRental(
  id: string,
  input: ActivateRentalInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rental = await tx.rental.findUnique({ where: { id } });
      if (!rental) {
        throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
      }

      const allowed = RENTAL_STATUS_TRANSITIONS[rental.status] as readonly string[];
      if (!allowed.includes("ACTIVE")) {
        throw new AppError(
          `Rental cannot be activated from status ${rental.status}`,
          409,
          ErrorCode.CONFLICT
        );
      }

      const activeAssignments = await tx.vehicleDeployment.count({
        where: { rentalId: id, status: "ACTIVE" },
      });
      if (activeAssignments === 0) {
        throw new AppError(
          "Rental must have an active vehicle assignment before activation",
          409,
          ErrorCode.CONFLICT
        );
      }

      const activatedAt = input.activatedAt ?? new Date();
      if (activatedAt.getTime() < rental.startDate.getTime()) {
        throw new AppError(
          "activatedAt cannot be before the rental start date",
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }

      const updated = await tx.rental.updateMany({
        where: { id, status: rental.status, version: rental.version },
        data: {
          status: "ACTIVE",
          activatedAt,
          version: { increment: 1 },
        },
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
        action: "ACTIVATE",
        resource: "Rental",
        resourceId: id,
        oldData: { status: rental.status },
        newData: { status: "ACTIVE", activatedAt },
        summary: `${actor.userName} activated rental ${rental.rentalNumber}.`,
        db: tx,
        throwOnError: true,
      });

      const rentalWithDetail = await tx.rental.findUniqueOrThrow({
        where: { id },
        select: rentalDetailSelect,
      });

      return { rental: rentalWithDetail };
    });
  } catch (err) {
    rethrowPrismaError(err, "Rental could not be activated");
  }
}

export async function closeRental(
  id: string,
  input: CloseRentalInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rental = await tx.rental.findUnique({
        where: { id },
        select: {
          id: true,
          rentalNumber: true,
          status: true,
          hubId: true,
          startDate: true,
          endDate: true,
          version: true,
          notes: true,
          collectionPeriod: true,
          currency: true,
        },
      });

      if (!rental) {
        throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
      }
      assertHubAccess(actor.user, rental.hubId);

      if (rental.status !== "ACTIVE" && rental.status !== "ON_HOLD") {
        throw new AppError(
          `Only an ACTIVE or ON_HOLD rental can be closed (current status: ${rental.status})`,
          409,
          ErrorCode.CONFLICT
        );
      }

      const lock = await tx.rental.updateMany({
        where: { id, version: rental.version },
        data: { version: { increment: 1 } },
      });
      if (lock.count === 0) {
        throw new AppError(
          "Rental was modified concurrently; please retry",
          409,
          ErrorCode.CONFLICT
        );
      }

      const endDate = input.endDate ?? new Date();
      if (endDate.getTime() < rental.startDate.getTime()) {
        throw new AppError(
          "endDate cannot be before the rental start date",
          400,
          ErrorCode.VALIDATION_ERROR
        );
      }

      await generateRentalDues(tx, {
        rentalId: rental.id,
        throughDate: endDate,
        actor,
      });

      if (input.rentAdjustment) {
        await recordRentAdjustment(tx, {
          rentalId: rental.id,
          amount: new Prisma.Decimal(input.rentAdjustment.amount),
          direction: input.rentAdjustment.direction,
          reason: input.rentAdjustment.reason,
          idempotencyKey: input.rentAdjustment.idempotencyKey,
          actor,
        });
      }

      if (input.depositAdjustment) {
        await recordDepositTransaction(tx, {
          rentalId: rental.id,
          type: "ADJUSTMENT",
          direction: input.depositAdjustment.direction,
          amount: new Prisma.Decimal(input.depositAdjustment.amount),
          reason: input.depositAdjustment.reason,
          idempotencyKey: input.depositAdjustment.idempotencyKey,
          actor,
        });
      }

      if (input.depositRefund) {
        await recordDepositTransaction(tx, {
          rentalId: rental.id,
          type: "REFUND",
          direction: "DEBIT",
          amount: new Prisma.Decimal(input.depositRefund.amount),
          reference: input.depositRefund.reference ?? null,
          reason: input.depositRefund.reason ?? "Rental closure refund",
          idempotencyKey: input.depositRefund.idempotencyKey,
          actor,
        });
      }

      const financialSummary = await getRentalFinancialSummary(tx, rental.id);
      const depositTotals = await getDepositBalanceByRental(tx, rental.id);

      const activeAssignments = await tx.vehicleDeployment.findMany({
        where: { rentalId: rental.id, status: "ACTIVE" },
        select: {
          id: true,
          vehicleId: true,
          vehicle: {
            select: {
              id: true,
              registrationNumber: true,
              status: true,
              version: true,
              deletedAt: true,
            },
          },
        },
      });

      const vehicleDispositions: Array<{
        vehicleId: string;
        registrationNumber: string;
        previousStatus: string;
        status: string;
      }> = [];

      for (const assignment of activeAssignments) {
        const vehicle = assignment.vehicle;
        if (!vehicle || vehicle.deletedAt) continue;

        let returnStatus = input.vehicleReturnStatus;
        if (!returnStatus) {
          const openServices = await tx.service.count({
            where: {
              vehicleId: vehicle.id,
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
          });
          returnStatus = openServices > 0 ? "IN_SERVICE" : "IDLE";
        }

        await tx.vehicleDeployment.update({
          where: { id: assignment.id },
          data: { status: "COMPLETED", endDate },
        });

        if (returnStatus !== vehicle.status) {
          const updatedVehicle = await tx.vehicle.updateMany({
            where: {
              id: vehicle.id,
              status: vehicle.status,
              version: vehicle.version,
              deletedAt: null,
            },
            data: {
              status: returnStatus,
              version: { increment: 1 },
            },
          });

          if (updatedVehicle.count === 0) {
            throw new AppError(
              "Vehicle status was modified concurrently; please retry",
              409,
              ErrorCode.CONFLICT
            );
          }

          await tx.vehicleStatusHistory.create({
            data: {
              vehicleId: vehicle.id,
              previousStatus: vehicle.status,
              status: returnStatus,
              changedById: actor.userId,
              reason: `Rental ${rental.rentalNumber} closed`,
              notes: input.notes ?? null,
            },
          });

          await logAudit({
            ...actor,
            action: "UPDATE",
            resource: "Vehicle",
            resourceId: vehicle.id,
            oldData: { status: vehicle.status },
            newData: {
              status: returnStatus,
              rentalId: rental.id,
              rentalStatus: "COMPLETED",
            },
            summary: `${actor.userName} moved vehicle ${vehicle.registrationNumber} from ${vehicle.status} to ${returnStatus} on rental closure.`,
            db: tx,
            throwOnError: true,
          });
        }

        vehicleDispositions.push({
          vehicleId: vehicle.id,
          registrationNumber: vehicle.registrationNumber,
          previousStatus: vehicle.status,
          status: returnStatus,
        });
      }

      const closedAt = new Date();
      const settlementSnapshot = {
        closedAt: closedAt.toISOString(),
        endDate: endDate.toISOString(),
        totalCharges: financialSummary.totalCharges.toString(),
        confirmedCollections: financialSummary.confirmedCollections.toString(),
        outstanding: financialSummary.outstanding.toString(),
        depositBalance: depositTotals.balance.toString(),
        vehicleDispositions,
      };

      const updatedRental = await tx.rental.update({
        where: { id: rental.id },
        data: {
          status: "COMPLETED",
          endDate,
          closedAt,
          closedById: actor.userId,
          finalOutstandingAmount: financialSummary.outstanding,
          finalDepositBalance: depositTotals.balance,
          settlementSnapshot: settlementSnapshot as Prisma.InputJsonValue,
          notes: input.notes ?? rental.notes,
        },
        select: rentalDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "CLOSE",
        resource: "Rental",
        resourceId: rental.id,
        oldData: { status: rental.status },
        newData: {
          status: "COMPLETED",
          endDate,
          settlement: settlementSnapshot,
        },
        summary: `${actor.userName} closed rental ${rental.rentalNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return {
        rental: updatedRental,
        settlement: {
          endDate,
          closedAt,
          totalCharges: financialSummary.totalCharges,
          confirmedCollections: financialSummary.confirmedCollections,
          outstanding: financialSummary.outstanding,
          depositBalance: depositTotals.balance,
          vehicleDispositions,
        },
      };
    });
  } catch (err) {
    rethrowPrismaError(err, "Rental could not be closed");
  }
}
