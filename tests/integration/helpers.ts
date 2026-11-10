import bcrypt from "bcryptjs";
import type { Express } from "express";
import request from "supertest";
import prisma from "../../src/database/prismaClient.js";
import { getRolePermissionBuckets, type RoleName } from "../../src/database/roles.js";
import { PERMISSION_REGISTRY } from "../../src/registry/perm.js";

export async function resetDatabase() {
  const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = current_schema()
       AND tablename <> '_prisma_migrations'`
  );
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`
  );
}

export async function seedRbac() {
  const permissionIds = new Map<string, string>();
  for (const group of PERMISSION_REGISTRY) {
    for (const action of group.actions) {
      const permission = await prisma.permission.upsert({
        where: { resource_action: { resource: group.resource, action } },
        update: {},
        create: {
          resource: group.resource,
          action,
          description: `Allow ${action} on ${group.resource}`,
        },
      });
      permissionIds.set(`${group.resource}:${action}`, permission.id);
    }
  }

  const buckets = getRolePermissionBuckets(PERMISSION_REGISTRY);
  for (const name of Object.keys(buckets) as RoleName[]) {
    const ids = buckets[name]
      .map((key) => permissionIds.get(key))
      .filter((id): id is string => Boolean(id))
      .map((id) => ({ id }));
    await prisma.role.upsert({
      where: { name },
      update: { permissions: { set: ids } },
      create: { name, permissions: { connect: ids } },
    });
  }
}

export async function createUserRecord(input: {
  name: string;
  phoneNumber: string;
  email?: string | null;
  role: RoleName;
  password?: string;
  status?: "ONBOARDING" | "ACTIVE" | "SUSPENDED";
}) {
  const role = await prisma.role.findUniqueOrThrow({
    where: { name: input.role },
  });
  const passwordHash = await bcrypt.hash(input.password ?? "Password123", 10);
  return prisma.user.create({
    data: {
      name: input.name,
      phoneNumber: input.phoneNumber,
      email: input.email ?? `${input.phoneNumber}@test.local`,
      passwordHash,
      status: input.status ?? "ACTIVE",
      roleId: role.id,
    },
  });
}

export async function login(
  app: Express,
  phoneNumber: string,
  password = "Password123"
) {
  const response = await request(app)
    .post("/auth/login")
    .send({ phone: phoneNumber, password });
  if (response.status !== 200) {
    throw new Error(`Login failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.accessToken as string;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
