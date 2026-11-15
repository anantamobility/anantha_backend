import bcrypt from "bcryptjs";
import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import { redisDel } from "../config/redis.js";
import {
  AppError,
  ErrorCode,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import type {
  AssignUserRoleInput,
  ChangeUserStatusInput,
  ListUsersQuery,
  UpdateUserInput,
} from "../validation/user.js";

type Tx = Prisma.TransactionClient;

const roleSelect = { id: true, name: true } as const;

const userSafeSelect = {
  id: true,
  email: true,
  phoneNumber: true,
  status: true,
  lastLoginAt: true,
  roleId: true,
  createdAt: true,
  updatedAt: true,
  role: { select: roleSelect },
  staffProfile: {
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      hubId: true,
      status: true,
    },
  },
  riderProfile: {
    select: { id: true, fullName: true, riderCode: true, status: true },
  },
} as const;

const userListSelect = {
  id: true,
  email: true,
  phoneNumber: true,
  status: true,
  lastLoginAt: true,
  roleId: true,
  createdAt: true,
  updatedAt: true,
  role: { select: roleSelect },
  staffProfile: { select: { id: true, fullName: true } },
  riderProfile: { select: { id: true, fullName: true } },
} as const;

type NamedUser = {
  phoneNumber: string;
  staffProfile?: { fullName: string } | null;
  riderProfile?: { fullName: string } | null;
};

// A user has no name of its own; the linked profile holds it.
export function displayName(user: NamedUser) {
  return (
    user.staffProfile?.fullName ??
    user.riderProfile?.fullName ??
    user.phoneNumber
  );
}

export async function resolveRole(
  tx: Tx,
  input: { roleId?: string; roleName?: string }
) {
  const role = input.roleId
    ? await tx.role.findUnique({ where: { id: input.roleId } })
    : await tx.role.findUnique({
        where: { name: input.roleName as string },
      });

  if (!role) {
    throw new AppError("Role not found", 404, ErrorCode.NOT_FOUND);
  }
  return role;
}

async function loadTarget(tx: Tx, id: string) {
  const user = await tx.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      phoneNumber: true,
      status: true,
      roleId: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      deletedAt: true,
      role: { select: roleSelect },
      staffProfile: {
        select: {
          id: true,
          fullName: true,
          employeeCode: true,
          hubId: true,
          status: true,
        },
      },
      riderProfile: {
        select: { id: true, fullName: true, riderCode: true, status: true },
      },
    },
  });
  if (!user || user.deletedAt) {
    throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
  }
  return user;
}

export async function createUserRecord(
  tx: Tx,
  input: {
    phoneNumber: string;
    password: string;
    roleId: string;
    email?: string | null;
    status?: "ONBOARDING" | "ACTIVE" | "SUSPENDED";
  }
) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  return tx.user.create({
    data: {
      email: input.email ?? null,
      phoneNumber: input.phoneNumber,
      passwordHash,
      status: input.status ?? "ACTIVE",
      roleId: input.roleId,
    },
    select: { id: true },
  });
}

export async function listUsers(query: ListUsersQuery) {
  const { page, limit, search, roleId, status } = query;
  const where: Prisma.UserWhereInput = { deletedAt: null };
  if (roleId) where.roleId = roleId;
  if (status) where.status = status;
  const searchWhere: Prisma.UserWhereInput | null = search
    ? {
        OR: [
          { staffProfile: { fullName: { contains: search, mode: "insensitive" } } },
          { riderProfile: { fullName: { contains: search, mode: "insensitive" } } },
          { email: { contains: search, mode: "insensitive" } },
          { phoneNumber: { contains: search, mode: "insensitive" } },
        ],
      }
    : null;
  if (searchWhere) {
    if (where.OR) {
      where.AND = [{ OR: where.OR }, searchWhere];
      delete where.OR;
    } else {
      where.OR = searchWhere.OR;
    }
  }

  const orderBy: Prisma.UserOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: userListSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getUserById(id: string) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { ...userSafeSelect, deletedAt: true },
  });

  if (!target || target.deletedAt) {
    throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
  }

  const { deletedAt: _deletedAt, ...safeUser } = target;
  return safeUser;
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await loadTarget(tx, id);

      const data: Prisma.UserUncheckedUpdateInput = {};
      if (input.phoneNumber !== undefined) data.phoneNumber = input.phoneNumber;
      if (input.email !== undefined) data.email = input.email;

      const user = await tx.user.update({
        where: { id },
        data,
        select: userSafeSelect,
      });

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "User",
        resourceId: user.id,
        oldData: existing,
        newData: user,
        summary: `${actor.userName} updated user ${displayName(user)}.`,
        db: tx,
        throwOnError: true,
      });

      return user;
    });
  } catch (err) {
    throw AppError.fromPrisma(
      err,
      "A user with this email or phone number already exists"
    ) ?? err;
  }
}

export async function assignUserRole(
  id: string,
  input: AssignUserRoleInput,
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const existing = await loadTarget(tx, id);
    const role = await resolveRole(tx, { roleId: input.roleId });

    if (existing.id === actor.userId && existing.role.name === "ADMIN" && role.name !== "ADMIN") {
      throw new AppError(
        "Administrators cannot remove their own administrator role",
        409,
        ErrorCode.CONFLICT
      );
    }

    const user = await tx.user.update({
      where: { id },
      data: { roleId: role.id },
      select: userSafeSelect,
    });

    await logAudit({
      ...actor,
      action: "ASSIGN_ROLE",
      resource: "User",
      resourceId: user.id,
      oldData: existing,
      newData: {
        ...user,
        reason: input.reason ?? null,
      },
      summary: `${actor.userName} changed user ${displayName(user)} role from ${existing.role.name} to ${role.name}.`,
      db: tx,
      throwOnError: true,
    });

    return user;
  });
}

export async function changeUserStatus(
  id: string,
  input: ChangeUserStatusInput,
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const existing = await loadTarget(tx, id);

    if (existing.id === actor.userId && input.status !== "ACTIVE") {
      throw new AppError(
        "Administrators cannot deactivate their own account",
        409,
        ErrorCode.CONFLICT
      );
    }

    const user = await tx.user.update({
      where: { id },
      data: { status: input.status },
      select: userSafeSelect,
    });

    if (input.status !== "ACTIVE") {
      const revoked = await redisDel(`session:${id}`);
      if (!revoked) {
        console.warn(
          `Redis unavailable: sessions for user ${id} could not be revoked after status change`
        );
      }
    }

    await logAudit({
      ...actor,
      action: "UPDATE_STATUS",
      resource: "User",
      resourceId: user.id,
      oldData: existing,
      newData: { ...user, reason: input.reason ?? null },
      summary: `${actor.userName} changed user ${displayName(user)} status from ${existing.status} to ${input.status}.`,
      db: tx,
      throwOnError: true,
    });

    return user;
  });
}

export async function revokeUserSessions(id: string, actor: AuditActor) {
  return prisma.$transaction(async (tx) => {
    const existing = await loadTarget(tx, id);
    const revoked = await redisDel(`session:${id}`);
    if (!revoked) {
      throw new AppError(
        "Session store is unavailable; sessions were not revoked",
        503,
        ErrorCode.INTERNAL_ERROR
      );
    }

    await logAudit({
      ...actor,
      action: "REVOKE_SESSIONS",
      resource: "User",
      resourceId: existing.id,
      newData: { userId: existing.id },
      summary: `${actor.userName} revoked active sessions for user ${displayName(existing)}.`,
      db: tx,
      throwOnError: true,
    });

    return { message: "User sessions revoked" };
  });
}

export async function deleteUser(id: string, actor: AuditActor) {
  return prisma.$transaction(async (tx) => {
    const existing = await loadTarget(tx, id);

    if (existing.id === actor.userId) {
      throw new AppError(
        "Administrators cannot delete their own account",
        409,
        ErrorCode.CONFLICT
      );
    }

    const deletedAt = new Date();
    const user = await tx.user.update({
      where: { id },
      data: { deletedAt, status: "SUSPENDED" },
      select: userSafeSelect,
    });

    const revoked = await redisDel(`session:${id}`);
    if (!revoked) {
      console.warn(
        `Redis unavailable: sessions for user ${id} could not be revoked after soft delete`
      );
    }

    await logAudit({
      ...actor,
      action: "DELETE",
      resource: "User",
      resourceId: user.id,
      oldData: existing,
      newData: { ...user, deletedAt },
      summary: `${actor.userName} soft-deleted user ${displayName(existing)}.`,
      db: tx,
      throwOnError: true,
    });

    return user;
  });
}
