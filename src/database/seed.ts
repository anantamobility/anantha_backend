import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import prisma from './prismaClient.js';
import bcrypt from 'bcryptjs';
import { PERMISSION_REGISTRY } from '../registry/perm.js';
import {
  getRolePermissionBuckets,
  type RoleName,
} from './roles.js';

export { getRolePermissionBuckets };
export type { RoleName };

async function main() {
  console.log('Starting Seed...');

  // --------------------------------------------------------
  // 1. UPSERT PERMISSIONS AND STORE THEIR IDS
  // --------------------------------------------------------
  console.log('... Syncing Permissions Registry');

  const permIdByKey = new Map<string, string>();

  for (const group of PERMISSION_REGISTRY) {
    for (const action of group.actions) {
      const permission = await prisma.permission.upsert({
        where: {
          resource_action: {
            resource: group.resource,
            action,
          },
        },
        update: {},
        create: {
          resource: group.resource,
          action,
          description: `Allow ${action} on ${group.resource}`,
        },
      });

      const key = `${group.resource}:${action}`;
      permIdByKey.set(key, permission.id);
    }
  }

  // --------------------------------------------------------
  // 2. UPSERT ROLES AND CONNECT ONLY MISSING PERMISSIONS
  // --------------------------------------------------------
  console.log('... Seeding Roles');

  const buckets = getRolePermissionBuckets(PERMISSION_REGISTRY);

  for (const name of Object.keys(buckets) as RoleName[]) {
    // Create the role if it does not exist.
    // Do not overwrite an existing role.
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });

    // Fetch the role with its existing permissions.
    const current = await prisma.role.findUnique({
      where: { name },
      include: { permissions: true },
    });

    if (!current) {
      throw new Error(`Role not found after upsert: ${name}`);
    }

    // Build a set of existing resource:action keys.
    const have = new Set(
      current.permissions.map(
        (permission) =>
          `${permission.resource}:${permission.action}`
      )
    );

    // Select only permissions that are missing.
    const toConnect = buckets[name]
      .filter((key) => !have.has(key))
      .map((key) => {
        const id = permIdByKey.get(key);

        if (!id) {
          throw new Error(
            `Permission ID not found for key: ${key}`
          );
        }

        return { id };
      });

    // Connect missing permissions without removing existing ones.
    if (toConnect.length > 0) {
      await prisma.role.update({
        where: { name },
        data: {
          permissions: {
            connect: toConnect,
          },
        },
      });
    }

    console.log(
      `...role ${name}: connected ${toConnect.length} new permission(s)`
    );
  }

  // --------------------------------------------------------
  // 3. CREATE ADMIN USER
  // --------------------------------------------------------
  console.log('... Seeding Admin');

  const adminEmail = 'admin@anantha.com';
  const adminPhone = '1234567890';
  const hashedPassword = await bcrypt.hash(
    'supersecret123',
    10
  );

  // Fetch the ADMIN role.
  const adminRoleRef = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
  });

  if (!adminRoleRef) {
    throw new Error('Admin role creation failed');
  }

  // Create the admin if missing, or ensure the existing
  // admin account is associated with the ADMIN role.
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: {
        connect: { id: adminRoleRef.id },
      },
    },
    create: {
      name: 'IT-ADMIN',
      phoneNumber: adminPhone,
      email: adminEmail,
      password: hashedPassword,
      status: 'ACTIVE',
      role: {
        connect: { id: adminRoleRef.id },
      },
    },
  });

  console.log('Seeding Complete!');
  console.log(`Login: ${adminPhone} / supersecret123`);
}

// Only run the seed when this file is executed directly, never on import.
const isDirectExecution = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirectExecution) {
  main()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
