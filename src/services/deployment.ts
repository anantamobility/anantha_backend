import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import { AppError } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import type {
  DeployInInput,
  DeployOutInput,
  ListDeploymentsQuery,
} from "../validation/deployment.js";

const CLOSED_RENTAL_STATUSES = ["COMPLETED", "TERMINATED", "CANCELLED"];

export const deploymentSelect = {
  id: true,
  vehicleId: true,
  riderId: true,
  rentalId: true,
  outHubId: true,
  inHubId: true,
  assignedById: true,
  startDate: true,
  endDate: true,
  startOdometer: true,
  endOdometer: true,
  status: true,
  reason: true,
  createdAt: true,
  updatedAt: true,
  vehicle: {
    select: { id: true, registrationNumber: true, make: true, model: true, status: true },
  },
  rider: { select: { id: true, riderCode: true, fullName: true } },
  rental: { select: { id: true, rentalNumber: true, status: true } },
  outHub: { select: { id: true, name: true, hubCode: true } },
  inHub: { select: { id: true, name: true, hubCode: true } },
} as const;

export async function deploymentOut(input: DeployOutInput, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rental = await tx.rental.findUnique({
        where: { id: input.rentalId },
        select: { id: true, rentalNumber: true, status: true, riderId: true },
      });

      if (!rental) {
        throw new AppError("Rental not found", 404);
      }
      if (CLOSED_RENTAL_STATUSES.includes(rental.status)) {
        throw new AppError(
          `Vehicle cannot be deployed out for a ${rental.status} rental`,
          409
        );
      }

      const vehicle = await tx.vehicle.findUnique({
        where: { id: input.vehicleId },
        select: { id: true, registrationNumber: true, deletedAt: true },
      });

      if (!vehicle || vehicle.deletedAt) {
        throw new AppError("Vehicle not found", 404);
      }

      const deployment = await tx.vehicleDeployment.create({
        data: {
          vehicleId: vehicle.id,
          rentalId: rental.id,
          riderId: rental.riderId,
          outHubId: input.outHubId,
          assignedById: actor.userId,
          startDate: input.startDate ?? new Date(),
          startOdometer: input.startOdometer ?? null,
          status: "ACTIVE",
          reason: input.reason ?? null,
        },
        select: deploymentSelect,
      });

      await tx.vehicle.update({
        where: { id: vehicle.id },
        data: { status: "DEPLOYED", statusChangedAt: new Date() },
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "VehicleDeployment",
        resourceId: deployment.id,
        newData: {
          vehicleId: vehicle.id,
          rentalId: rental.id,
          outHubId: input.outHubId,
          startDate: deployment.startDate,
          startOdometer: deployment.startOdometer,
        },
        summary: `${actor.userName} deployed vehicle ${vehicle.registrationNumber} out for rental ${rental.rentalNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return deployment;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Vehicle could not be deployed out") ?? err;
  }
}

export async function deploymentIn(
  id: string,
  input: DeployInInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const deployment = await tx.vehicleDeployment.findUnique({
        where: { id },
        select: {
          id: true,
          vehicleId: true,
          startDate: true,
          status: true,
          vehicle: { select: { id: true, registrationNumber: true } },
        },
      });

      if (!deployment) {
        throw new AppError("Deployment not found", 404);
      }
      if (deployment.status !== "ACTIVE") {
        throw new AppError(
          `Only an ACTIVE deployment can be deployed in (current status: ${deployment.status})`,
          409
        );
      }

      const endDate = input.endDate ?? new Date();
      if (endDate.getTime() < deployment.startDate.getTime()) {
        throw new AppError("endDate cannot be before the deployment start date", 400);
      }

      let returnStatus = input.vehicleReturnStatus;
      if (!returnStatus) {
        const openServices = await tx.service.count({
          where: {
            vehicleId: deployment.vehicleId,
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
        });
        returnStatus = openServices > 0 ? "IN_SERVICE" : "IDLE";
      }

      const updated = await tx.vehicleDeployment.update({
        where: { id: deployment.id },
        data: {
          status: "COMPLETED",
          endDate,
          endOdometer: input.endOdometer ?? null,
          inHubId: input.inHubId,
        },
        select: deploymentSelect,
      });

      await tx.vehicle.update({
        where: { id: deployment.vehicleId },
        data: { status: returnStatus, statusChangedAt: new Date() },
      });

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "VehicleDeployment",
        resourceId: deployment.id,
        oldData: { status: deployment.status },
        newData: {
          status: "COMPLETED",
          endDate,
          endOdometer: updated.endOdometer,
          inHubId: input.inHubId,
          vehicleStatus: returnStatus,
        },
        summary: `${actor.userName} deployed vehicle ${deployment.vehicle.registrationNumber} in to hub ${input.inHubId}.`,
        db: tx,
        throwOnError: true,
      });

      return updated;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Vehicle could not be deployed in") ?? err;
  }
}

export async function listDeployments(query: ListDeploymentsQuery) {
  const { page, limit, search } = query;

  const where: Prisma.VehicleDeploymentWhereInput = {};
  if (query.rentalId) where.rentalId = query.rentalId;
  if (query.vehicleId) where.vehicleId = query.vehicleId;
  if (query.riderId) where.riderId = query.riderId;
  if (query.outHubId) where.outHubId = query.outHubId;
  if (query.inHubId) where.inHubId = query.inHubId;
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    where.startDate = { gte: query.from, lte: query.to };
  }
  if (search) {
    where.OR = [
      { vehicle: { registrationNumber: { contains: search, mode: "insensitive" } } },
      { rider: { fullName: { contains: search, mode: "insensitive" } } },
      { rental: { rentalNumber: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.VehicleDeploymentOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [deployments, total] = await Promise.all([
    prisma.vehicleDeployment.findMany({
      where,
      select: deploymentSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.vehicleDeployment.count({ where }),
  ]);

  return {
    deployments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getDeploymentById(id: string) {
  const deployment = await prisma.vehicleDeployment.findUnique({
    where: { id },
    select: deploymentSelect,
  });

  if (!deployment) {
    throw new AppError("Deployment not found", 404);
  }

  return deployment;
}
