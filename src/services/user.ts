import bcrypt from "bcryptjs";
import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import { redisDel } from "../config/redis.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { actorHubId, isAdmin } from "../utils/scope.js";
import type { UserContext } from "../types/user.js";
import type {
  AssignUserRoleInput,
  ChangeUserStatusInput,
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from "../validation/user.js";

type Tx = Prisma.TransactionClient;

const roleSelect = { id: true, name: true } as const;

const userSafeSelect = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  status: true,
  lastLoginAt: true,
  roleId: true,
  createdAt: true,
  updatedAt: true,
  role: { select: roleSelect },
  staffProfile: {
    select: { id: true, employeeCode: true, hubId: true, status: true },
  },
  riderProfile: { select: { id: true, riderCode: true, status: true } },
} as const;

const userListSelect = {
  id: true,
  name: true,
  email: true,
  phoneNumber: true,
  status: true,
  lastLoginAt: true,
  roleId: true,
  createdAt: true,
  updatedAt: true,
  role: { select: roleSelect },
} as const;

function userSnapshot(user: {
  name: string;
  email: string | null;
  phoneNumber: string;
  status: string;
  roleId: string;
}) {
  return {
    name: user.name,
    email: user.email,
    phoneNumber: user.phoneNumber,
    status: user.status,
    roleId: user.roleId,
  };
}

async function resolveRole(
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

async function activeAdminCount(tx: Tx, excludeUserId?: string) {
  return tx.user.count({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      role: { name: "ADMIN" },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

async function assertNotLastActiveAdmin(
  tx: Tx,
  target: { id: string; roleId: string; status: string },
  next: { roleId?: string; status?: string }
) {
  const targetIsActiveAdmin = target.roleId === undefined ? false : true;
  const currentRole = await tx.role.findUnique({
    where: { id: target.roleId },
    select: { name: true },
  });
  if (!currentRole || currentRole.name !== "ADMIN") {
    return;
  }

  const willRemainActiveAdmin =
    target.status === "ACTIVE" &&
    (next.status === undefined || next.status === "ACTIVE") &&
    (next.roleId === undefined ||
      next.roleId === target.roleId);

  if (willRemainActiveAdmin) return;

  const others = await activeAdminCount(tx, target.id);
  if (others === 0) {
    throw new AppError(
      "The last active administrator cannot be demoted, deactivated or deleted",
      409,
      ErrorCode.CONFLICT
    );
  }
}

async function loadTarget(tx: Tx, id: string) {
  const user = await tx.user.findUnique({
    where: { id },
    include: {
      role: { select: roleSelect },
      staffProfile: { select: { hubId: true } },
    },
  });
  if (!user || user.deletedAt) {
    throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
  }
  return user;
}

function assertUserScope(
  actorUser: UserContext | undefined,
  target: { id: string; staffProfile?: { hubId: string | null } | null }
) {
  if (!actorUser || isAdmin(actorUser)) return;
  const scopedHub = actorHubId(actorUser);
  if (!scopedHub) return;
  if (target.id === actorUser.id) return;
  if (target.staffProfile?.hubId !== scopedHub) {
    throw new AppError(
      "You do not have access to users outside your assigned hub",
      403,
      ErrorCode.FORBIDDEN
    );
  }
}

export async function createUser(input: CreateUserInput, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const role = await resolveRole(tx, input);
      const passwordHash = await bcrypt.hash(input.password, 10);

      const user = await tx.user.create({
        data: {
          name: input.name,
          email: input.email ?? null,
          phoneNumber: input.phoneNumber,
          passwordHash,
          status: input.status ?? "ACTIVE",
          roleId: role.id,
        },
        select: userSafeSelect,
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "User",
        resourceId: user.id,
        newData: {
          ...userSnapshot(user),
          role: role.name,
        },
        summary: `${actor.userName} created user ${user.name} with role ${role.name}.`,
        db: tx,
        throwOnError: true,
      });

      return user;
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A user with this email or phone number already exists"
    );
  }
}

export async function listUsers(query: ListUsersQuery, user?: UserContext) {
  const { page, limit, search, roleId, status } = query;
  const where: Prisma.UserWhereInput = { deletedAt: null };
  const scopedHubId = user && !isAdmin(user) ? actorHubId(user) : null;
  if (scopedHubId) {
    where.OR = [{ id: user!.id }, { staffProfile: { is: { hubId: scopedHubId } } }];
  }
  if (roleId) where.roleId = roleId;
  if (status) where.status = status;
  const searchWhere: Prisma.UserWhereInput | null = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
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

export async function getUserById(id: string, user?: UserContext) {
  const target = await prisma.user.findUnique({
    where: { id },
    select: { ...userSafeSelect, deletedAt: true },
  });

  if (!target || target.deletedAt) {
    throw new AppError("User not found", 404, ErrorCode.NOT_FOUND);
  }
  assertUserScope(user, target);

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
      assertUserScope(actor.user, existing);

      const data: Prisma.UserUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
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
        oldData: userSnapshot(existing),
        newData: userSnapshot(user),
        summary: `${actor.userName} updated user ${user.name}.`,
        db: tx,
        throwOnError: true,
      });

      return user;
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A user with this email or phone number already exists"
    );
  }
}

export async function assignUserRole(
  id: string,
  input: AssignUserRoleInput,
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const existing = await loadTarget(tx, id);
    assertUserScope(actor.user, existing);
    const role = await resolveRole(tx, { roleId: input.roleId });

    if (existing.id === actor.userId && existing.role.name === "ADMIN" && role.name !== "ADMIN") {
      throw new AppError(
        "Administrators cannot remove their own administrator role",
        409,
        ErrorCode.CONFLICT
      );
    }

    await assertNotLastActiveAdmin(tx, existing, { roleId: role.id });

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
      oldData: { role: existing.role.name, roleId: existing.roleId },
      newData: {
        role: role.name,
        roleId: role.id,
        reason: input.reason ?? null,
      },
      summary: `${actor.userName} changed user ${user.name} role from ${existing.role.name} to ${role.name}.`,
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
    assertUserScope(actor.user, existing);

    if (existing.id === actor.userId && input.status !== "ACTIVE") {
      throw new AppError(
        "Administrators cannot deactivate their own account",
        409,
        ErrorCode.CONFLICT
      );
    }

    await assertNotLastActiveAdmin(tx, existing, { status: input.status });

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
      oldData: { status: existing.status },
      newData: { status: input.status, reason: input.reason ?? null },
      summary: `${actor.userName} changed user ${user.name} status from ${existing.status} to ${input.status}.`,
      db: tx,
      throwOnError: true,
    });

    return user;
  });
}

export async function revokeUserSessions(id: string, actor: AuditActor) {
  return prisma.$transaction(async (tx) => {
    const existing = await loadTarget(tx, id);
    assertUserScope(actor.user, existing);
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
      summary: `${actor.userName} revoked active sessions for user ${existing.name}.`,
      db: tx,
      throwOnError: true,
    });

    return { message: "User sessions revoked" };
  });
}

export async function deleteUser(id: string, actor: AuditActor) {
  return prisma.$transaction(async (tx) => {
    const existing = await loadTarget(tx, id);
    assertUserScope(actor.user, existing);

    if (existing.id === actor.userId) {
      throw new AppError(
        "Administrators cannot delete their own account",
        409,
        ErrorCode.CONFLICT
      );
    }

    await assertNotLastActiveAdmin(tx, existing, { status: "SUSPENDED" });

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
      oldData: userSnapshot(existing),
      newData: { deletedAt, status: "SUSPENDED" },
      summary: `${actor.userName} soft-deleted user ${existing.name}.`,
      db: tx,
      throwOnError: true,
    });

    return user;
  });
}
