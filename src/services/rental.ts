import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import { AppError } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { resolveRentalPricing } from "./rental-pricing.js";
import {
  getDepositBalanceByRental,
  getOrCreateDepositForRental,
  recordDepositLedgerEntry,
} from "./depositLedger.js";
import {
  generateRentalDues,
  getRentalFinancialSummary,
} from "./rental-dues.js";
import { toDecimal } from "./rental-schedule.js";
import type {
  CloseRentalInput,
  CreateRentalInput,
  ListRentalsQuery,
} from "../validation/rental.js";

type Tx = Prisma.TransactionClient;

const CLOSED_RENTAL_STATUSES = ["COMPLETED", "TERMINATED", "CANCELLED"];

const rentalClientSelect = {
  id: true,
  clientCode: true,
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
  hubCode: true,
  isActive: true,
} as const;

const rentalVehicleSelect = {
  id: true,
  registrationNumber: true,
  make: true,
  model: true,
  status: true,
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
  startDate: true,
  endDate: true,
  expectedEndDate: true,
  status: true,
  statusChangedAt: true,
  collectionPeriod: true,
  dailyRate: true,
  weeklyRate: true,
  fortnightlyRate: true,
  monthlyRate: true,
  securityDepositRequired: true,
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
} as const;

export const rentalDetailSelect = {
  ...rentalListSelect,
  createdById: true,
  closedById: true,
  createdBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
  assignments: {
    where: { status: "ACTIVE" },
    select: {
      id: true,
      vehicleId: true,
      riderId: true,
      outHubId: true,
      inHubId: true,
      startDate: true,
      endDate: true,
      status: true,
      vehicle: { select: rentalVehicleSelect },
    },
  },
} as const;

const assignmentSelect = {
  id: true,
  vehicleId: true,
  riderId: true,
  rentalId: true,
  outHubId: true,
  inHubId: true,
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

async function assertClient(tx: Tx, clientId: string) {
  const client = await tx.client.findUnique({
    where: { id: clientId },
    select: { id: true, isActive: true, deletedAt: true },
  });

  if (!client || client.deletedAt) {
    throw new AppError("Client not found", 404);
  }
  if (!client.isActive) {
    throw new AppError(
      "Client is inactive and cannot be used for a rental",
      409
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
    throw new AppError("Rider not found", 404);
  }
  if (rider.status !== "ACTIVE") {
    throw new AppError(
      `Rider must be ACTIVE to be used in a rental (current status: ${rider.status})`,
      409
    );
  }
  if (rider.clientId && rider.clientId !== input.clientId) {
    throw new AppError(
      "Rider does not belong to the selected client",
      409
    );
  }
  if (rider.rentalType && rider.rentalType !== input.rentalType) {
    throw new AppError(
      "Rider rental classification does not match the rental type",
      409
    );
  }
  if (
    rider.b2cMode &&
    input.b2cMode &&
    rider.b2cMode !== input.b2cMode
  ) {
    throw new AppError(
      "Rider B2C mode does not match the rental B2C mode",
      409
    );
  }
  if (
    rider.b2bRiderMgmt &&
    input.b2bRiderMgmt &&
    rider.b2bRiderMgmt !== input.b2bRiderMgmt
  ) {
    throw new AppError(
      "Rider B2B management mode does not match the rental B2B mode",
      409
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
    throw new AppError("Hub not found", 404);
  }
  if (!hub.isActive) {
    throw new AppError(
      "Hub is inactive and cannot be used for a rental",
      409
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
      409
    );
  }

  // One rental has one active vehicle.
  const activeForRental = await tx.vehicleDeployment.count({
    where: { rentalId: input.rental.id, status: "ACTIVE" },
  });
  if (activeForRental > 0) {
    throw new AppError(
      "Rental already has an active vehicle assignment",
      409
    );
  }

  const vehicle = await tx.vehicle.findUnique({
    where: { id: input.vehicleId },
    select: {
      id: true,
      registrationNumber: true,
      status: true,
      isActive: true,
      deletedAt: true,
    },
  });

  if (!vehicle || vehicle.deletedAt) {
    throw new AppError("Vehicle not found", 404);
  }
  if (!vehicle.isActive) {
    throw new AppError(
      "Vehicle is inactive and cannot be assigned",
      409
    );
  }
  if (vehicle.status !== "IDLE") {
    throw new AppError(
      `Vehicle is not available for assignment (current status: ${vehicle.status})`,
      409
    );
  }

  const activeForVehicle = await tx.vehicleDeployment.count({
    where: { vehicleId: vehicle.id, status: "ACTIVE" },
  });
  if (activeForVehicle > 0) {
    throw new AppError(
      "Vehicle already has an active assignment",
      409
    );
  }

  const startDate = input.startDate ?? new Date();
  const assignment = await tx.vehicleDeployment.create({
    data: {
      vehicleId: vehicle.id,
      riderId: input.rental.riderId,
      rentalId: input.rental.id,
      outHubId: input.rental.hubId,
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
      deletedAt: null,
    },
    data: {
      status: "DEPLOYED",
      statusChangedAt: new Date(),
    },
  });

  if (updatedVehicle.count === 0) {
    throw new AppError(
      "Vehicle status was modified concurrently; please retry",
      409
    );
  }

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
    const pricing = resolveRentalPricing(input.manualPricing);

    return await prisma.$transaction(async (tx) => {
      await assertClient(tx, input.clientId);

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

      const data: Prisma.RentalUncheckedCreateInput = {
        rentalNumber: generateRentalNumber(),
        rentalType: input.rentalType,
        b2cMode: input.b2cMode ?? null,
        b2bRiderMgmt: input.b2bRiderMgmt ?? null,
        clientId: input.clientId,
        riderId: input.riderId ?? null,
        hubId: input.hubId,
        startDate: input.startDate,
        expectedEndDate: input.expectedEndDate ?? null,
        status: "ACTIVE",
        activatedAt: new Date(),
        collectionPeriod: input.collectionPeriod,
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
          hubId: rental.hubId,
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
    throw AppError.fromPrisma(err, "Rental could not be created") ?? err;
  }
}

export async function listRentals(query: ListRentalsQuery) {
  const { page, limit, search } = query;
  const where: Prisma.RentalWhereInput = {};

  if (query.rentalType) where.rentalType = query.rentalType;
  if (query.status) where.status = query.status;
  if (query.clientId) where.clientId = query.clientId;
  if (query.riderId) where.riderId = query.riderId;
  if (query.hubId) where.hubId = query.hubId;
  if (query.collectionPeriod) where.collectionPeriod = query.collectionPeriod;

  if (search) {
    where.OR = [
      { rentalNumber: { contains: search, mode: "insensitive" } },
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

export async function getRentalById(id: string) {
  const rental = await prisma.rental.findUnique({
    where: { id },
    select: rentalDetailSelect,
  });

  if (!rental) {
    throw new AppError("Rental not found", 404);
  }

  return { rental };
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
          notes: true,
          collectionPeriod: true,
        },
      });

      if (!rental) {
        throw new AppError("Rental not found", 404);
      }

      if (rental.status !== "ACTIVE") {
        throw new AppError(
          `Only an ACTIVE rental can be closed (current status: ${rental.status})`,
          409
        );
      }

      const activeDeployments = await tx.vehicleDeployment.count({
        where: { rentalId: rental.id, status: "ACTIVE" },
      });
      if (activeDeployments > 0) {
        throw new AppError("Return the vehicle before closing the rental", 409);
      }

      const endDate = input.endDate ?? new Date();
      if (endDate.getTime() < rental.startDate.getTime()) {
        throw new AppError(
          "endDate cannot be before the rental start date",
          400
        );
      }

      await generateRentalDues(tx, {
        rentalId: rental.id,
        throughDate: endDate,
        includePartial: true,
        actor,
      });

      if (input.depositRefund) {
        await recordDepositLedgerEntry(tx, {
          rentalId: rental.id,
          type: "REFUND",
          direction: "DEBIT",
          amount: new Prisma.Decimal(input.depositRefund.amount),
          reference: input.depositRefund.reference ?? null,
          reason: input.depositRefund.reason ?? "Rental closure refund",
          actor,
        });
      }

      const financialSummary = await getRentalFinancialSummary(tx, rental.id);
      const depositTotals = await getDepositBalanceByRental(tx, rental.id);

      const closedAt = new Date();
      const statementSnapshot = {
        closedAt: closedAt.toISOString(),
        endDate: endDate.toISOString(),
        totalCharges: financialSummary.totalCharges.toString(),
        confirmedCollections: financialSummary.confirmedCollections.toString(),
        outstanding: financialSummary.outstanding.toString(),
        depositBalance: depositTotals.balance.toString(),
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
          payStatement: statementSnapshot,
        },
        summary: `${actor.userName} closed rental ${rental.rentalNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return {
        rental: updatedRental,
        payStatement: {
          endDate,
          closedAt,
          totalCharges: financialSummary.totalCharges,
          confirmedCollections: financialSummary.confirmedCollections,
          outstanding: financialSummary.outstanding,
          depositBalance: depositTotals.balance,
        },
      };
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Rental could not be closed") ?? err;
  }
}
