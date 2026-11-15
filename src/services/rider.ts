import prisma from "../database/prismaClient.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  B2BRiderMgmt,
  B2CMode,
  RentalStatus,
  RentalType,
  RiderStatus,
  PayStatementStatus,
} from "../generated/prisma/client.js";
import {
  AppError,
  ErrorCode,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { createUserRecord, resolveRole } from "./user.js";
import { generateRiderId } from "../utils/idGenerator.js";
import type {
  ChangeRiderStatusInput,
  CreateRiderInput,
  ListRidersQuery,
  UpdateRiderInput,
} from "../validation/rider.js";

export const riderUserSelect = {
  id: true,
  email: true,
  phoneNumber: true,
} as const;

export const riderClientSelect = {
  id: true,
  type: true,
  name: true,
  companyName: true,
  isActive: true,
} as const;

export const riderHubSelect = {
  id: true,
  name: true,
  hubCode: true,
  isActive: true,
} as const;

export const riderListSelect = {
  id: true,
  userId: true,
  riderCode: true,
  fullName: true,
  dateOfBirth: true,
  gender: true,
  address: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  rentalType: true,
  b2cMode: true,
  b2bRiderMgmt: true,
  clientId: true,
  hubId: true,
  status: true,
  onboardedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  user: { select: riderUserSelect },
  client: { select: riderClientSelect },
  hub: { select: riderHubSelect },
} as const;

export const riderDetailSelect = {
  ...riderListSelect,
  statusChangedAt: true,
  _count: {
    select: {
      documents: true,
    },
  },
} as const;

// TERMINATED is terminal and requires a new rider record for re-onboarding.
export const ALLOWED_RIDER_STATUS_TRANSITIONS: Record<
  RiderStatus,
  readonly RiderStatus[]
> = {
  ONBOARDING: [
    RiderStatus.ACTIVE,
    RiderStatus.INACTIVE,
    RiderStatus.SUSPENDED,
    RiderStatus.TERMINATED,
  ],
  ACTIVE: [
    RiderStatus.SUSPENDED,
    RiderStatus.INACTIVE,
    RiderStatus.TERMINATED,
  ],
  SUSPENDED: [
    RiderStatus.ACTIVE,
    RiderStatus.INACTIVE,
    RiderStatus.TERMINATED,
  ],
  INACTIVE: [RiderStatus.ACTIVE, RiderStatus.TERMINATED],
  TERMINATED: [],
};

function validateClassification(
  rentalType: RentalType | null | undefined,
  b2cMode: B2CMode | null | undefined,
  b2bRiderMgmt: B2BRiderMgmt | null | undefined,
  clientId: string | null | undefined
) {
  if (rentalType === null || rentalType === undefined) return;

  if (rentalType === RentalType.B2C) {
    if (!b2cMode) {
      throw new AppError(
        "b2cMode is required for B2C riders",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
    if (b2bRiderMgmt) {
      throw new AppError(
        "b2bRiderMgmt is not applicable to B2C riders",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
  }

  if (rentalType === RentalType.B2B) {
    if (!b2bRiderMgmt) {
      throw new AppError(
        "b2bRiderMgmt is required for B2B riders",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
    if (!clientId) {
      throw new AppError(
        "clientId is required for B2B riders",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
    if (b2cMode) {
      throw new AppError(
        "b2cMode is not applicable to B2B riders",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
  }
}

async function assertHubExists(tx: Prisma.TransactionClient, hubId: string) {
  const hub = await tx.hub.findUnique({ where: { id: hubId } });
  if (!hub) {
    throw new AppError("Hub not found", 404, ErrorCode.NOT_FOUND);
  }
}

async function assertClientExists(
  tx: Prisma.TransactionClient,
  clientId: string
) {
  const client = await tx.client.findUnique({ where: { id: clientId } });
  if (!client) {
    throw new AppError("Client not found", 404, ErrorCode.NOT_FOUND);
  }
}

export function addressInput(
  address: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (address === undefined) return undefined;
  if (address === null) return Prisma.JsonNull;
  return address as Prisma.InputJsonValue;
}

export async function createRider(
  input: CreateRiderInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.hubId) await assertHubExists(tx, input.hubId);
      if (input.clientId) await assertClientExists(tx, input.clientId);

      validateClassification(
        input.rentalType,
        input.b2cMode ?? null,
        input.b2bRiderMgmt ?? null,
        input.clientId ?? null
      );

      const role = await resolveRole(tx, { roleName: "RIDER" });
      const user = await createUserRecord(tx, {
        phoneNumber: input.phoneNumber,
        email: input.email,
        password: input.password,
        roleId: role.id,
      });

      const data: Prisma.RiderUncheckedCreateInput = {
        riderCode: input.riderCode ?? (await generateRiderId(tx)),
        fullName: input.fullName,
        userId: user.id,
        aadharNumber: input.aadharNumber ?? null,
        panNumber: input.panNumber ?? null,
        licenseNumber: input.licenseNumber ?? null,
        medicalReportExpiryDate: input.medicalReportExpiryDate ?? null,
        agreementDate: input.agreementDate ?? null,
        policeVerificationValidUpto: input.policeVerificationValidUpto ?? null,
        backgroundVerificationExpiryDate:
          input.backgroundVerificationExpiryDate ?? null,
        dateOfLastWorkingDay: input.dateOfLastWorkingDay ?? null,
        bankName: input.bankName ?? null,
        branch: input.branch ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        rentalType: input.rentalType,
        b2cMode: input.b2cMode ?? null,
        b2bRiderMgmt: input.b2bRiderMgmt ?? null,
        clientId: input.clientId ?? null,
        hubId: input.hubId ?? null,
        status: RiderStatus.ONBOARDING,
        onboardedAt: new Date(),
        statusChangedAt: new Date(),
      };

      const address = addressInput(input.address);
      if (address !== undefined) data.address = address;

      const rider = await tx.rider.create({
        data,
        select: riderDetailSelect,
      });
      const { address: _address, ...riderAudit } = rider;

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Rider",
        resourceId: rider.id,
        newData: riderAudit,
        summary: `${actor.userName} onboarded rider ${rider.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return rider;
    });
  } catch (err) {
    throw AppError.fromPrisma(
      err,
      "A rider with this code, phone number or email already exists"
    ) ?? err;
  }
}

export async function listRiders(query: ListRidersQuery) {
  const {
    page,
    limit,
    search,
    status,
    rentalType,
    b2cMode,
    b2bRiderMgmt,
    clientId,
    hubId,
  } = query;

  const where: Prisma.RiderWhereInput = { deletedAt: null };
  if (status) where.status = status;
  if (rentalType) where.rentalType = rentalType;
  if (b2cMode) where.b2cMode = b2cMode;
  if (b2bRiderMgmt) where.b2bRiderMgmt = b2bRiderMgmt;
  if (clientId) where.clientId = clientId;
  if (hubId) where.hubId = hubId;

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { riderCode: { contains: search, mode: "insensitive" } },
      { user: { phoneNumber: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.RiderOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [riders, total] = await Promise.all([
    prisma.rider.findMany({
      where,
      select: riderListSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.rider.count({ where }),
  ]);

  return {
    riders,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getRiderById(id: string) {
  const rider = await prisma.rider.findUnique({
    where: { id },
    select: { ...riderDetailSelect, deletedAt: true },
  });

  if (!rider || rider.deletedAt) {
    throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
  }

  const { deletedAt: _deletedAt, ...safeRider } = rider;
  return safeRider;
}

export async function updateRider(
  id: string,
  input: UpdateRiderInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.rider.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
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

      if (
        input.clientId !== undefined &&
        input.clientId !== null &&
        input.clientId !== existing.clientId
      ) {
        await assertClientExists(tx, input.clientId);
      }

      const mergedRentalType =
        input.rentalType !== undefined
          ? input.rentalType
          : (existing.rentalType as RentalType | null);
      const mergedB2cMode =
        input.b2cMode !== undefined
          ? input.b2cMode
          : (existing.b2cMode as B2CMode | null);
      const mergedB2bMgmt =
        input.b2bRiderMgmt !== undefined
          ? input.b2bRiderMgmt
          : (existing.b2bRiderMgmt as B2BRiderMgmt | null);
      const mergedClientId =
        input.clientId !== undefined ? input.clientId : existing.clientId;

      validateClassification(
        mergedRentalType,
        mergedB2cMode,
        mergedB2bMgmt,
        mergedClientId
      );

      const data: Prisma.RiderUncheckedUpdateInput = {};
      if (input.fullName !== undefined) data.fullName = input.fullName;
      if (input.riderCode !== undefined) data.riderCode = input.riderCode;
      if (input.aadharNumber !== undefined) data.aadharNumber = input.aadharNumber;
      if (input.panNumber !== undefined) data.panNumber = input.panNumber;
      if (input.licenseNumber !== undefined) data.licenseNumber = input.licenseNumber;
      if (input.medicalReportExpiryDate !== undefined) {
        data.medicalReportExpiryDate = input.medicalReportExpiryDate;
      }
      if (input.agreementDate !== undefined) {
        data.agreementDate = input.agreementDate;
      }
      if (input.policeVerificationValidUpto !== undefined) {
        data.policeVerificationValidUpto = input.policeVerificationValidUpto;
      }
      if (input.backgroundVerificationExpiryDate !== undefined) {
        data.backgroundVerificationExpiryDate =
          input.backgroundVerificationExpiryDate;
      }
      if (input.dateOfLastWorkingDay !== undefined) {
        data.dateOfLastWorkingDay = input.dateOfLastWorkingDay;
      }
      if (input.bankName !== undefined) data.bankName = input.bankName;
      if (input.branch !== undefined) data.branch = input.branch;
      if (input.dateOfBirth !== undefined) {
        data.dateOfBirth = input.dateOfBirth;
      }
      if (input.gender !== undefined) data.gender = input.gender;
      if (input.emergencyContactName !== undefined) {
        data.emergencyContactName = input.emergencyContactName;
      }
      if (input.emergencyContactPhone !== undefined) {
        data.emergencyContactPhone = input.emergencyContactPhone;
      }
      if (input.rentalType !== undefined) data.rentalType = input.rentalType;
      if (input.b2cMode !== undefined) data.b2cMode = input.b2cMode;
      if (input.b2bRiderMgmt !== undefined) {
        data.b2bRiderMgmt = input.b2bRiderMgmt;
      }
      if (input.clientId !== undefined) data.clientId = input.clientId;
      if (input.hubId !== undefined) data.hubId = input.hubId;

      const address = addressInput(input.address);
      if (address !== undefined) data.address = address;

      const rider = await tx.rider.update({
        where: { id },
        data,
        select: riderDetailSelect,
      });

      const { address: _oldAddress, ...riderBefore } = existing;
      const { address: _newAddress, ...riderAfter } = rider;

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Rider",
        resourceId: rider.id,
        oldData: riderBefore,
        newData: riderAfter,
        summary: `${actor.userName} updated rider ${rider.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return rider;
    });
  } catch (err) {
    throw AppError.fromPrisma(
      err,
      "A rider with this code, phone number or email already exists"
    ) ?? err;
  }
}

export async function changeRiderStatus(
  id: string,
  input: ChangeRiderStatusInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rider = await tx.rider.findUnique({ where: { id } });
      if (!rider || rider.deletedAt) {
        throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
      }

      const previousStatus = rider.status;
      const nextStatus = input.status as RiderStatus;

      if (previousStatus === nextStatus) {
        throw new AppError(
          `Rider already has status ${nextStatus}`,
          409,
          ErrorCode.CONFLICT
        );
      }

      if (
        !ALLOWED_RIDER_STATUS_TRANSITIONS[previousStatus].includes(nextStatus)
      ) {
        throw new AppError(
          `Invalid status transition from ${previousStatus} to ${nextStatus}`,
          409,
          ErrorCode.CONFLICT
        );
      }

      const statusChangedAt = new Date();
      const updateResult = await tx.rider.updateMany({
        where: {
          id,
          status: previousStatus,
          version: rider.version,
          deletedAt: null,
        },
        data: {
          status: nextStatus,
          statusChangedAt,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new AppError(
          "Rider status was modified concurrently; please retry",
          409,
          ErrorCode.CONFLICT
        );
      }

      const { deletedAt: _deletedAt, ...currentRider } = rider;
      const updatedRider = {
        ...currentRider,
        status: nextStatus,
        statusChangedAt,
        version: rider.version + 1,
      };
      const { address: _oldAddress, ...riderBefore } = rider;
      const { address: _newAddress, ...riderAfter } = updatedRider;

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Rider",
        resourceId: id,
        oldData: riderBefore,
        newData: {
          ...riderAfter,
          reason: input.reason ?? null,
        },
        summary: `${actor.userName} changed rider ${rider.riderCode} status from ${previousStatus} to ${nextStatus}.`,
        db: tx,
        throwOnError: true,
      });

      return { rider: updatedRider };
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Rider status could not be changed") ?? err;
  }
}

export async function deleteRider(id: string, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.rider.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
      }

      const activeRentals = await tx.rental.count({
        where: {
          riderId: id,
          status: {
            in: [
              RentalStatus.DRAFT,
              RentalStatus.PENDING_APPROVAL,
              RentalStatus.ACTIVE,
              RentalStatus.ON_HOLD,
            ],
          },
        },
      });
      if (activeRentals > 0) {
        throw new AppError(
          "Rider cannot be deleted while they have open rentals",
          409,
          ErrorCode.CONFLICT
        );
      }

      const openPayStatements = await tx.riderPayStatement.count({
        where: {
          riderId: id,
          status: {
            in: [
              PayStatementStatus.DRAFT,
              PayStatementStatus.PENDING_APPROVAL,
              PayStatementStatus.PAYABLE,
              PayStatementStatus.APPROVED,
            ],
          },
        },
      });
      if (openPayStatements > 0) {
        throw new AppError(
          "Rider cannot be deleted while they have open pay statements",
          409,
          ErrorCode.CONFLICT
        );
      }

      const openPayouts = await tx.riderPayStatement.count({
        where: { riderId: id, status: "APPROVED" },
      });
      if (openPayouts > 0) {
        throw new AppError(
          "Rider cannot be deleted while they have approved pay statements awaiting payment",
          409,
          ErrorCode.CONFLICT
        );
      }

      const deletedAt = new Date();
      const rider = await tx.rider.update({
        where: { id },
        data: { deletedAt },
        select: riderDetailSelect,
      });

      const { address: _oldAddress, ...riderBefore } = existing;
      const { address: _newAddress, ...riderAfter } = rider;

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "Rider",
        resourceId: rider.id,
        oldData: riderBefore,
        newData: riderAfter,
        summary: `${actor.userName} soft-deleted rider ${existing.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return rider;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Rider could not be deleted") ?? err;
  }
}
