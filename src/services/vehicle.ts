import prisma from "../database/prismaClient.js";
import { Prisma, VehicleStatus } from "../generated/prisma/client.js";
import { AppError } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import type {
  ChangeVehicleStatusInput,
  CreateVehicleInput,
  ListVehiclesQuery,
  UpdateVehicleInput,
} from "../validation/vehicle.js";

export const vehicleHubSelect = {
  id: true,
  name: true,
  hubCode: true,
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
  statusChangedAt: true,
  acquiredAt: true,
  retiredAt: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  hub: { select: vehicleHubSelect },
} as const;

export const vehicleDetailSelect = {
  ...vehicleListSelect,
  vehicleCategory: true,
  vehicleType: true,
  seats: true,
  batteryType: true,
  batteryCapacity: true,
  nominalRange: true,
  bootSpace: true,
  chargingOptions: true,
  chargerProvided: true,
  noOfTyres: true,
  tyres: true,
  batteryNumber: true,
  batteryModelNumber: true,
  batteryBrand: true,
  registrationType: true,
  ownershipType: true,
  dateOfPurchase: true,
  dateOfDelivery: true,
  dateOfRegistration: true,
  dateOfOperation: true,
  warrantyStartDate: true,
  warrantyEndDate: true,
  safeCabCertificateExpiryDate: true,
  telematicsExpiryDate: true,
  loanProvider: true,
  emiAmount: true,
  tenurePeriod: true,
  emiDueDate: true,
  insurancePolicyNumber: true,
  insuranceProvider: true,
  insurancePolicyType: true,
  insuranceValidFrom: true,
  insuranceValidTo: true,
  insurancePremiumAmount: true,
  insuranceStatus: true,
  insuranceThirdParty: true,
  _count: {
    select: {
      assignments: true,
      services: true,
      documents: true,
    },
  },
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

function tyresInput(tyres: unknown[] | null | undefined) {
  if (tyres === undefined || tyres === null) return undefined;
  return tyres as Prisma.InputJsonValue;
}

async function assertHubExists(tx: Prisma.TransactionClient, hubId: string) {
  const hub = await tx.hub.findUnique({ where: { id: hubId } });
  if (!hub) {
    throw new AppError("Hub not found", 404);
  }
}

export async function createVehicle(
  input: CreateVehicleInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.hubId) await assertHubExists(tx, input.hubId);

      const data: Prisma.VehicleUncheckedCreateInput = {
        registrationNumber: input.registrationNumber,
        hubId: input.hubId ?? null,
        make: input.make ?? null,
        model: input.model ?? null,
        year: input.year ?? null,
        color: input.color ?? null,
        vin: input.vin ?? null,
        status: VehicleStatus.IDLE,
        statusChangedAt: new Date(),
        isActive: input.isActive ?? true,
        vehicleCategory: input.vehicleCategory ?? null,
        vehicleType: input.vehicleType ?? null,
        seats: input.seats ?? null,
        batteryType: input.batteryType ?? null,
        batteryCapacity: input.batteryCapacity ?? null,
        nominalRange: input.nominalRange ?? null,
        bootSpace: input.bootSpace ?? null,
        chargingOptions: input.chargingOptions ?? null,
        chargerProvided: input.chargerProvided ?? null,
        noOfTyres: input.noOfTyres ?? null,
        batteryNumber: input.batteryNumber ?? null,
        batteryModelNumber: input.batteryModelNumber ?? null,
        batteryBrand: input.batteryBrand ?? null,
        registrationType: input.registrationType ?? null,
        ownershipType: input.ownershipType ?? null,
        dateOfPurchase: input.dateOfPurchase ?? null,
        dateOfDelivery: input.dateOfDelivery ?? null,
        dateOfRegistration: input.dateOfRegistration ?? null,
        dateOfOperation: input.dateOfOperation ?? null,
        warrantyStartDate: input.warrantyStartDate ?? null,
        warrantyEndDate: input.warrantyEndDate ?? null,
        safeCabCertificateExpiryDate:
          input.safeCabCertificateExpiryDate ?? null,
        telematicsExpiryDate: input.telematicsExpiryDate ?? null,
        loanProvider: input.loanProvider ?? null,
        emiAmount: input.emiAmount ?? null,
        tenurePeriod: input.tenurePeriod ?? null,
        emiDueDate: input.emiDueDate ?? null,
        insurancePolicyNumber: input.insurancePolicyNumber ?? null,
        insuranceProvider: input.insuranceProvider ?? null,
        insurancePolicyType: input.insurancePolicyType ?? null,
        insuranceValidFrom: input.insuranceValidFrom ?? null,
        insuranceValidTo: input.insuranceValidTo ?? null,
        insurancePremiumAmount: input.insurancePremiumAmount ?? null,
        insuranceStatus: input.insuranceStatus ?? null,
        insuranceThirdParty: input.insuranceThirdParty ?? null,
      };

      const tyres = tyresInput(input.tyres);
      if (tyres !== undefined) data.tyres = tyres;

      if (input.acquiredAt !== undefined) data.acquiredAt = input.acquiredAt;

      const vehicle = await tx.vehicle.create({
        data,
        select: vehicleDetailSelect,
      });

      const { tyres: _tyres, ...vehicleAudit } = vehicle;

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Vehicle",
        resourceId: vehicle.id,
        newData: vehicleAudit,
        summary: `${actor.userName} created vehicle ${vehicle.registrationNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return vehicle;
    });
  } catch (err) {
    throw AppError.fromPrisma(
      err,
      "A vehicle with this registration number or VIN already exists"
    ) ?? err;
  }
}

export async function listVehicles(query: ListVehiclesQuery) {
  const { page, limit, search, status, hubId, make, model, isActive } = query;

  const where: Prisma.VehicleWhereInput = { deletedAt: null };
  if (status) where.status = status;
  if (hubId) where.hubId = hubId;
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

export async function getVehicleById(id: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    select: { ...vehicleDetailSelect, deletedAt: true },
  });

  if (!vehicle || vehicle.deletedAt) {
    throw new AppError("Vehicle not found", 404);
  }

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
        throw new AppError("Vehicle not found", 404);
      }
      if (input.hubId !== undefined && input.hubId !== null) {
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
      if (input.vehicleCategory !== undefined) {
        data.vehicleCategory = input.vehicleCategory;
      }
      if (input.vehicleType !== undefined) data.vehicleType = input.vehicleType;
      if (input.seats !== undefined) data.seats = input.seats;
      if (input.batteryType !== undefined) data.batteryType = input.batteryType;
      if (input.batteryCapacity !== undefined) {
        data.batteryCapacity = input.batteryCapacity;
      }
      if (input.nominalRange !== undefined) data.nominalRange = input.nominalRange;
      if (input.bootSpace !== undefined) data.bootSpace = input.bootSpace;
      if (input.chargingOptions !== undefined) {
        data.chargingOptions = input.chargingOptions;
      }
      if (input.chargerProvided !== undefined) {
        data.chargerProvided = input.chargerProvided;
      }
      if (input.noOfTyres !== undefined) data.noOfTyres = input.noOfTyres;
      if (input.batteryNumber !== undefined) {
        data.batteryNumber = input.batteryNumber;
      }
      if (input.batteryModelNumber !== undefined) {
        data.batteryModelNumber = input.batteryModelNumber;
      }
      if (input.batteryBrand !== undefined) data.batteryBrand = input.batteryBrand;
      if (input.registrationType !== undefined) {
        data.registrationType = input.registrationType;
      }
      if (input.ownershipType !== undefined) {
        data.ownershipType = input.ownershipType;
      }
      if (input.dateOfPurchase !== undefined) {
        data.dateOfPurchase = input.dateOfPurchase;
      }
      if (input.dateOfDelivery !== undefined) {
        data.dateOfDelivery = input.dateOfDelivery;
      }
      if (input.dateOfRegistration !== undefined) {
        data.dateOfRegistration = input.dateOfRegistration;
      }
      if (input.dateOfOperation !== undefined) {
        data.dateOfOperation = input.dateOfOperation;
      }
      if (input.warrantyStartDate !== undefined) {
        data.warrantyStartDate = input.warrantyStartDate;
      }
      if (input.warrantyEndDate !== undefined) {
        data.warrantyEndDate = input.warrantyEndDate;
      }
      if (input.safeCabCertificateExpiryDate !== undefined) {
        data.safeCabCertificateExpiryDate = input.safeCabCertificateExpiryDate;
      }
      if (input.telematicsExpiryDate !== undefined) {
        data.telematicsExpiryDate = input.telematicsExpiryDate;
      }
      if (input.loanProvider !== undefined) data.loanProvider = input.loanProvider;
      if (input.emiAmount !== undefined) data.emiAmount = input.emiAmount;
      if (input.tenurePeriod !== undefined) {
        data.tenurePeriod = input.tenurePeriod;
      }
      if (input.emiDueDate !== undefined) data.emiDueDate = input.emiDueDate;
      if (input.insurancePolicyNumber !== undefined) {
        data.insurancePolicyNumber = input.insurancePolicyNumber;
      }
      if (input.insuranceProvider !== undefined) {
        data.insuranceProvider = input.insuranceProvider;
      }
      if (input.insurancePolicyType !== undefined) {
        data.insurancePolicyType = input.insurancePolicyType;
      }
      if (input.insuranceValidFrom !== undefined) {
        data.insuranceValidFrom = input.insuranceValidFrom;
      }
      if (input.insuranceValidTo !== undefined) {
        data.insuranceValidTo = input.insuranceValidTo;
      }
      if (input.insurancePremiumAmount !== undefined) {
        data.insurancePremiumAmount = input.insurancePremiumAmount;
      }
      if (input.insuranceStatus !== undefined) {
        data.insuranceStatus = input.insuranceStatus;
      }
      if (input.insuranceThirdParty !== undefined) {
        data.insuranceThirdParty = input.insuranceThirdParty;
      }

      const tyres = tyresInput(input.tyres);
      if (tyres !== undefined) data.tyres = tyres;

      const vehicle = await tx.vehicle.update({
        where: { id },
        data,
        select: vehicleDetailSelect,
      });

      const { tyres: _oldTyres, ...vehicleBefore } = existing;
      const { tyres: _newTyres, ...vehicleAfter } = vehicle;

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Vehicle",
        resourceId: vehicle.id,
        oldData: vehicleBefore,
        newData: vehicleAfter,
        summary: `${actor.userName} updated vehicle ${vehicle.registrationNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return vehicle;
    });
  } catch (err) {
    throw AppError.fromPrisma(
      err,
      "A vehicle with this registration number or VIN already exists"
    ) ?? err;
  }
}

export async function deleteVehicle(id: string, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.vehicle.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Vehicle not found", 404);
      }

      const [activeAssignments, openServices] = await Promise.all([
        tx.vehicleDeployment.count({
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
          409
        );
      }

      if (openServices > 0) {
        throw new AppError(
          "Vehicle cannot be deleted while it has an open service record",
          409
        );
      }

      // Soft delete keeps status history, services, documents and other
      // operational/audit records intact.
      const vehicle = await tx.vehicle.update({
        where: { id },
        data: { deletedAt: new Date() },
        select: vehicleDetailSelect,
      });

      const { tyres: _oldTyres, ...vehicleBefore } = existing;
      const { tyres: _newTyres, ...vehicleAfter } = vehicle;

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "Vehicle",
        resourceId: vehicle.id,
        oldData: vehicleBefore,
        newData: vehicleAfter,
        summary: `${actor.userName} deleted vehicle ${vehicle.registrationNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return vehicle;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Vehicle could not be deleted") ?? err;
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
        throw new AppError("Vehicle not found", 404);
      }

      const previousStatus = vehicle.status;
      const nextStatus = input.status;

      if (previousStatus === nextStatus) {
        throw new AppError(
          `Vehicle already has status ${nextStatus}`,
          409
        );
      }

      if (!ALLOWED_VEHICLE_STATUS_TRANSITIONS[previousStatus].includes(nextStatus)) {
        throw new AppError(
          `Invalid status transition from ${previousStatus} to ${nextStatus}`,
          409
        );
      }

      const activeAssignments = await tx.vehicleDeployment.count({
        where: { vehicleId: id, status: "ACTIVE" },
      });

      if (
        activeAssignments > 0 &&
        nextStatus !== VehicleStatus.DEPLOYED
      ) {
        throw new AppError(
          "Vehicle has an active assignment and cannot change to this status",
          409
        );
      }

      const retiredAt =
        nextStatus === VehicleStatus.RETIRED ? new Date() : undefined;
      const statusChangedAt = new Date();

      // Conditional update on the status we read guarantees that a concurrent
      // status change cannot silently overwrite a newer status.
      const updateResult = await tx.vehicle.updateMany({
        where: {
          id,
          status: previousStatus,
          deletedAt: null,
        },
        data: {
          status: nextStatus,
          statusChangedAt,
          ...(retiredAt ? { retiredAt } : {}),
        },
      });

      if (updateResult.count === 0) {
        throw new AppError(
          "Vehicle status was modified concurrently; please retry",
          409
        );
      }

      const { deletedAt: _deletedAt, ...currentVehicle } = vehicle;
      const updatedVehicle = {
        ...currentVehicle,
        status: nextStatus,
        statusChangedAt,
        ...(retiredAt ? { retiredAt } : {}),
      };

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Vehicle",
        resourceId: id,
        oldData: vehicle,
        newData: {
          ...updatedVehicle,
          reason: input.reason ?? null,
        },
        summary: `${actor.userName} changed vehicle ${vehicle.registrationNumber} status from ${previousStatus} to ${nextStatus}.`,
        db: tx,
        throwOnError: true,
      });

      return { vehicle: updatedVehicle };
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Vehicle status could not be changed") ?? err;
  }
}
