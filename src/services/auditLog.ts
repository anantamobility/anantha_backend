import type { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import type { ListAuditLogsQuery } from "../validation/auditLog.js";

export async function listAuditLogs(query: ListAuditLogsQuery) {
  const { page, limit, search, userId, resource, action, status, from, to } =
    query;

  const where: Prisma.AuditLogWhereInput = {};
  if (userId) where.userId = userId;
  if (resource) where.resource = { equals: resource, mode: "insensitive" };
  if (action) where.action = { equals: action, mode: "insensitive" };
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lte: to } : {}),
    };
  }
  if (search) {
    where.OR = [
      { summary: { contains: search, mode: "insensitive" } },
      { userName: { contains: search, mode: "insensitive" } },
      { resourceId: { contains: search, mode: "insensitive" } },
      { ipAddress: { contains: search, mode: "insensitive" } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: query.sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    auditLogs: logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
