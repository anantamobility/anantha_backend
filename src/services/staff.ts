import prisma from "../database/prismaClient.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import type {
  CreateStaffInput,
  ListStaffQuery,
  UpdateStaffInput,
} from "../validation/staff.js";

export const staffUserSelect = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
} as const;

function staffSnapshot(staff: {
  fullName: string;
  userId: string | null;
  employeeCode: string | null;
  phoneNumber: string | null;
  hubId: string | null;
  jobTitle: string | null;
  status: string;
  deletedAt: Date | null;
}) {
  return {
    fullName: staff.fullName,
    userId: staff.userId,
    employeeCode: staff.employeeCode,
    phoneNumber: staff.phoneNumber,
    hubId: staff.hubId,
    jobTitle: staff.jobTitle,
    status: staff.status,
    deletedAt: staff.deletedAt,
  };
}

async function assertUserExists(
  tx: Prisma.TransactionClient,
  userId: string
) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
  }
}

async function assertHubExists(
  tx: Prisma.TransactionClient,
  hubId: string
) {
  const hub = await tx.hub.findUnique({ where: { id: hubId } });
  if (!hub) {
    throw new AppError("Hub not found", 404, ErrorCode.NOT_FOUND);
  }
}

export async function createStaff(input: CreateStaffInput, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      if (input.userId) await assertUserExists(tx, input.userId);
      if (input.hubId) await assertHubExists(tx, input.hubId);

      const data: Prisma.StaffUncheckedCreateInput = {
        fullName: input.fullName,
        userId: input.userId ?? null,
        employeeCode: input.employeeCode ?? null,
        phoneNumber: input.phoneNumber ?? null,
        hubId: input.hubId ?? null,
        jobTitle: input.jobTitle ?? null,
        status: input.status ?? "ACTIVE",
      };

      const staff = await tx.staff.create({
        data,
        include: { user: { select: staffUserSelect } },
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Staff",
        resourceId: staff.id,
        newData: staffSnapshot(staff),
        summary: `${actor.userName} created a staff record for ${staff.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return staff;
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A staff member with this code or user already exists"
    );
  }
}

export async function listStaff(query: ListStaffQuery) {
  const { page, limit, search, hubId, status } = query;

  const where: Prisma.StaffWhereInput = { deletedAt: null };
  if (hubId) where.hubId = hubId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { employeeCode: { contains: search, mode: "insensitive" } },
      { phoneNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const [staff, total] = await Promise.all([
    prisma.staff.findMany({
      where,
      include: { user: { select: staffUserSelect } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.staff.count({ where }),
  ]);

  return {
    staff,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getStaffById(id: string) {
  const staff = await prisma.staff.findUnique({
    where: { id },
    include: { user: { select: staffUserSelect } },
  });

  if (!staff || staff.deletedAt) {
    throw new AppError("Staff not found", 404, ErrorCode.NOT_FOUND);
  }

  return staff;
}

export async function updateStaff(
  id: string,
  input: UpdateStaffInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.staff.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Staff not found", 404, ErrorCode.NOT_FOUND);
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

      const data: Prisma.StaffUncheckedUpdateInput = {};
      if (input.fullName !== undefined) data.fullName = input.fullName;
      if (input.userId !== undefined) data.userId = input.userId;
      if (input.employeeCode !== undefined) {
        data.employeeCode = input.employeeCode;
      }
      if (input.phoneNumber !== undefined) {
        data.phoneNumber = input.phoneNumber;
      }
      if (input.hubId !== undefined) data.hubId = input.hubId;
      if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle;
      if (input.status !== undefined) data.status = input.status;

      const staff = await tx.staff.update({
        where: { id },
        data,
        include: { user: { select: staffUserSelect } },
      });

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Staff",
        resourceId: staff.id,
        oldData: staffSnapshot(existing),
        newData: staffSnapshot(staff),
        summary: `${actor.userName} updated staff ${staff.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return staff;
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A staff member with this code or user already exists"
    );
  }
}

export async function deleteStaff(id: string, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.staff.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Staff not found", 404, ErrorCode.NOT_FOUND);
      }

      // Soft delete preserves payouts, documents, and other historical records.
      // The linked User account is intentionally left untouched.
      const staff = await tx.staff.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "Staff",
        resourceId: staff.id,
        oldData: staffSnapshot(existing),
        newData: staffSnapshot(staff),
        summary: `${actor.userName} deleted staff ${staff.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return staff;
    });
  } catch (err) {
    rethrowPrismaError(err, "Staff could not be deleted");
  }
}
