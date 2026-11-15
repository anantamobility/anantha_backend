import prisma from "../database/prismaClient.js";
import type { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  ErrorCode,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { createUserRecord, resolveRole } from "./user.js";
import { addressInput } from "./rider.js";
import { generateEmployeeId } from "../utils/idGenerator.js";
import type {
  CreateStaffInput,
  ListStaffQuery,
  UpdateStaffInput,
} from "../validation/staff.js";

export const staffUserSelect = {
  id: true,
  email: true,
  phoneNumber: true,
} as const;

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
      if (input.hubId) await assertHubExists(tx, input.hubId);

      const role = await resolveRole(tx, input);
      if (role.name === "ADMIN" && actor.userRole !== "ADMIN") {
        throw new AppError(
          "Only an administrator can assign the ADMIN role",
          409,
          ErrorCode.CONFLICT
        );
      }

      const user = await createUserRecord(tx, {
        phoneNumber: input.phoneNumber,
        email: input.email,
        password: input.password,
        roleId: role.id,
      });

      const data: Prisma.StaffUncheckedCreateInput = {
        userId: user.id,
        fullName: input.fullName,
        gender: input.gender,
        dateOfBirth: input.dateOfBirth ?? null,
        department: input.department ?? null,
        employeeCode: input.employeeCode ?? (await generateEmployeeId(tx)),
        hubId: input.hubId ?? null,
        jobTitle: input.jobTitle ?? null,
        status: input.status ?? "ACTIVE",
        alternatePhone: input.alternatePhone ?? null,
        emergencyContactName: input.emergencyContactName ?? null,
        emergencyContactPhone: input.emergencyContactPhone ?? null,
        bloodGroup: input.bloodGroup ?? null,
        employmentType: input.employmentType ?? null,
        workMode: input.workMode ?? null,
        educationalQualification: input.educationalQualification ?? null,
        anniversary: input.anniversary ?? null,
        dateOfJoining: input.dateOfJoining ?? null,
        probationEndDate: input.probationEndDate ?? null,
        dateOfLastWorkingDay: input.dateOfLastWorkingDay ?? null,
        dateOfRelieving: input.dateOfRelieving ?? null,
        aadharNumber: input.aadharNumber ?? null,
        panNumber: input.panNumber ?? null,
        bankName: input.bankName ?? null,
        branch: input.branch ?? null,
        bankAccountNumber: input.bankAccountNumber ?? null,
        bankIfsc: input.bankIfsc ?? null,
        bankHolderName: input.bankHolderName ?? null,
      };

      const address = addressInput(input.address);
      if (address !== undefined) data.address = address;

      const staff = await tx.staff.create({
        data,
        include: { user: { select: staffUserSelect } },
      });

      const { address: _address, ...staffAudit } = staff;

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Staff",
        resourceId: staff.id,
        newData: staffAudit,
        summary: `${actor.userName} created a staff record for ${staff.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return staff;
    });
  } catch (err) {
    throw AppError.fromPrisma(
      err,
      "A staff member with this code, phone number or email already exists"
    ) ?? err;
  }
}

export async function listStaff(query: ListStaffQuery) {
  const { page, limit, search, hubId, status } = query;

  const where: Prisma.StaffWhereInput = { deletedAt: null };
  if (status) where.status = status;
  if (hubId) where.hubId = hubId;
  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { employeeCode: { contains: search, mode: "insensitive" } },
      { user: { phoneNumber: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
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
      const existing = await tx.staff.findUnique({ where: { id }, include: { user: { select: staffUserSelect } } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Staff not found", 404, ErrorCode.NOT_FOUND);
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
      if (input.gender !== undefined) data.gender = input.gender;
      if (input.dateOfBirth !== undefined) data.dateOfBirth = input.dateOfBirth;
      if (input.department !== undefined) data.department = input.department;
      if (input.employeeCode !== undefined) {
        data.employeeCode = input.employeeCode;
      }
      if (input.hubId !== undefined) data.hubId = input.hubId;
      if (input.jobTitle !== undefined) data.jobTitle = input.jobTitle;
      if (input.status !== undefined) data.status = input.status;
      if (input.alternatePhone !== undefined) {
        data.alternatePhone = input.alternatePhone;
      }
      if (input.emergencyContactName !== undefined) {
        data.emergencyContactName = input.emergencyContactName;
      }
      if (input.emergencyContactPhone !== undefined) {
        data.emergencyContactPhone = input.emergencyContactPhone;
      }
      if (input.bloodGroup !== undefined) data.bloodGroup = input.bloodGroup;
      if (input.employmentType !== undefined) {
        data.employmentType = input.employmentType;
      }
      if (input.workMode !== undefined) data.workMode = input.workMode;
      if (input.educationalQualification !== undefined) {
        data.educationalQualification = input.educationalQualification;
      }
      if (input.anniversary !== undefined) data.anniversary = input.anniversary;
      if (input.dateOfJoining !== undefined) {
        data.dateOfJoining = input.dateOfJoining;
      }
      if (input.probationEndDate !== undefined) {
        data.probationEndDate = input.probationEndDate;
      }
      if (input.dateOfLastWorkingDay !== undefined) {
        data.dateOfLastWorkingDay = input.dateOfLastWorkingDay;
      }
      if (input.dateOfRelieving !== undefined) {
        data.dateOfRelieving = input.dateOfRelieving;
      }
      if (input.aadharNumber !== undefined) {
        data.aadharNumber = input.aadharNumber;
      }
      if (input.panNumber !== undefined) data.panNumber = input.panNumber;
      if (input.bankName !== undefined) data.bankName = input.bankName;
      if (input.branch !== undefined) data.branch = input.branch;
      if (input.bankAccountNumber !== undefined) {
        data.bankAccountNumber = input.bankAccountNumber;
      }
      if (input.bankIfsc !== undefined) data.bankIfsc = input.bankIfsc;
      if (input.bankHolderName !== undefined) {
        data.bankHolderName = input.bankHolderName;
      }

      const address = addressInput(input.address);
      if (address !== undefined) data.address = address;

      const staff = await tx.staff.update({
        where: { id },
        data,
        include: { user: { select: staffUserSelect } },
      });

      const { address: _oldAddress, ...staffBefore } = existing;
      const { address: _newAddress, ...staffAfter } = staff;

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Staff",
        resourceId: staff.id,
        oldData: staffBefore,
        newData: staffAfter,
        summary: `${actor.userName} updated staff ${staff.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return staff;
    });
  } catch (err) {
    throw AppError.fromPrisma(
      err,
      "A staff member with this code, phone number or email already exists"
    ) ?? err;
  }
}

export async function deleteStaff(id: string, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.staff.findUnique({ where: { id }, include: { user: { select: staffUserSelect } } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Staff not found", 404, ErrorCode.NOT_FOUND);
      }

      // Soft delete preserves payouts, documents, and other historical records.
      // The linked User account is intentionally left untouched.
      const staff = await tx.staff.update({
        where: { id },
        data: { deletedAt: new Date() },
        include: { user: { select: staffUserSelect } },
      });

      const { address: _oldAddress, ...staffBefore } = existing;
      const { address: _newAddress, ...staffAfter } = staff;

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "Staff",
        resourceId: staff.id,
        oldData: staffBefore,
        newData: staffAfter,
        summary: `${actor.userName} deleted staff ${staff.fullName}.`,
        db: tx,
        throwOnError: true,
      });

      return staff;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Staff could not be deleted") ?? err;
  }
}
