import { v4 as uuidv4 } from "uuid";
import prisma from "../database/prismaClient.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  B2BRiderMgmt,
  B2CMode,
  PayoutStatus,
  RentalStatus,
  RentalType,
  RiderStatus,
  PayStatementStatus,
} from "../generated/prisma/client.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { assertHubAccess, resolveHubFilter } from "../utils/scope.js";
import type { UserContext } from "../types/user.js";
import type {
  ChangeRiderStatusInput,
  CreateRiderInput,
  ListRidersQuery,
  UpdateRiderInput,
} from "../validation/rider.js";

export const riderUserSelect = {
  id: true,
  name: true,
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
  code: true,
  isActive: true,
} as const;

export const riderListSelect = {
  id: true,
  userId: true,
  riderCode: true,
  fullName: true,
  phoneNumber: true,
  email: true,
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

type RiderAuditShape = {
  riderCode: string;
  fullName: string;
  userId: string | null;
  phoneNumber: string | null;
  email: string | null;
  dateOfBirth: Date | null;
  gender: string | null;
  rentalType: string | null;
  b2cMode: string | null;
  b2bRiderMgmt: string | null;
  clientId: string | null;
  hubId: string | null;
  status: RiderStatus;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  onboardedAt: Date | null;
};

function riderSnapshot(rider: RiderAuditShape) {
  return {
    riderCode: rider.riderCode,
    fullName: rider.fullName,
    userId: rider.userId,
    phoneNumber: rider.phoneNumber,
    email: rider.email,
    dateOfBirth: rider.dateOfBirth,
    gender: rider.gender,
    rentalType: rider.rentalType,
    b2cMode: rider.b2cMode,
    b2bRiderMgmt: rider.b2bRiderMgmt,
    clientId: rider.clientId,
    hubId: rider.hubId,
    status: rider.status,
    emergencyContactName: rider.emergencyContactName,
    emergencyContactPhone: rider.emergencyContactPhone,
    onboardedAt: rider.onboardedAt,
  };
}

function generateRiderCode() {
  return `RDR-${uuidv4().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

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

async function assertUserExists(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
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

function addressInput(
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
      if (input.userId) await assertUserExists(tx, input.userId);
      if (input.hubId) await assertHubExists(tx, input.hubId);
      if (input.clientId) await assertClientExists(tx, input.clientId);
      assertHubAccess(actor.user, input.hubId);

      validateClassification(
        input.rentalType,
        input.b2cMode ?? null,
        input.b2bRiderMgmt ?? null,
        input.clientId ?? null
      );

      const data: Prisma.RiderUncheckedCreateInput = {
        riderCode: input.riderCode ?? generateRiderCode(),
        fullName: input.fullName,
        userId: input.userId ?? null,
        phoneNumber: input.phoneNumber,
        email: input.email ?? null,
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

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Rider",
        resourceId: rider.id,
        newData: riderSnapshot(rider),
        summary: `${actor.userName} onboarded rider ${rider.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return rider;
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A rider with this code or user already exists"
    );
  }
}

export async function listRiders(query: ListRidersQuery, user?: UserContext) {
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
  const scopedHubId = resolveHubFilter(user, hubId);
  if (scopedHubId) where.hubId = scopedHubId;

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { riderCode: { contains: search, mode: "insensitive" } },
      { phoneNumber: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
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

export async function getRiderById(id: string, user?: UserContext) {
  const rider = await prisma.rider.findUnique({
    where: { id },
    select: { ...riderDetailSelect, deletedAt: true },
  });

  if (!rider || rider.deletedAt) {
    throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
  }

  assertHubAccess(user, rider.hubId);
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
      assertHubAccess(actor.user, existing.hubId);
      if (input.hubId !== undefined && input.hubId !== null) {
        assertHubAccess(actor.user, input.hubId);
      }

      if (
        input.userId !== undefined &&
        input.userId !== null &&
        input.userId !== existing.userId
      ) {
        await assertUserExists(tx, input.userId);
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
      if (input.userId !== undefined) data.userId = input.userId;
      if (input.riderCode !== undefined) data.riderCode = input.riderCode;
      if (input.phoneNumber !== undefined) {
        data.phoneNumber = input.phoneNumber;
      }
      if (input.email !== undefined) data.email = input.email;
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

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Rider",
        resourceId: rider.id,
        oldData: riderSnapshot(existing),
        newData: riderSnapshot(rider),
        summary: `${actor.userName} updated rider ${rider.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return rider;
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A rider with this code or user already exists"
    );
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
      assertHubAccess(actor.user, rider.hubId);

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

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Rider",
        resourceId: id,
        oldData: { status: previousStatus },
        newData: {
          status: nextStatus,
          previousStatus,
          reason: input.reason ?? null,
        },
        summary: `${actor.userName} changed rider ${rider.riderCode} status from ${previousStatus} to ${nextStatus}.`,
        db: tx,
        throwOnError: true,
      });

      return { rider: updatedRider };
    });
  } catch (err) {
    rethrowPrismaError(err, "Rider status could not be changed");
  }
}

export async function deleteRider(id: string, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.rider.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
      }
      assertHubAccess(actor.user, existing.hubId);

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

      const openPayouts = await tx.payout.count({
        where: {
          riderId: id,
          status: {
            in: [
              PayoutStatus.PENDING,
              PayoutStatus.APPROVED,
              PayoutStatus.PROCESSING,
            ],
          },
        },
      });
      if (openPayouts > 0) {
        throw new AppError(
          "Rider cannot be deleted while they have open payouts",
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

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "Rider",
        resourceId: rider.id,
        oldData: riderSnapshot(existing),
        newData: { deletedAt },
        summary: `${actor.userName} soft-deleted rider ${existing.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return rider;
    });
  } catch (err) {
    rethrowPrismaError(err, "Rider could not be deleted");
  }
}
