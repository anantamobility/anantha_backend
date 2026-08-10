import prisma from './prismaClient.js'; // Ensure path is correct
import bcrypt from 'bcryptjs';
import { PERMISSION_REGISTRY } from '../registry/perm.js';

async function main() {
  console.log('Starting Seed...');

  // --------------------------------------------------------
  // 1. SYNC PERMISSIONS (From Registry to DB)
  // --------------------------------------------------------
  console.log('... Syncing Permissions Registry');
  
  // Storage for our different role buckets
  const allPermissionIds: { id: string }[] = [];
  const supervisorPermissionIds: { id: string }[] = [];

  for (const group of PERMISSION_REGISTRY) {
    for (const action of group.actions) {
      
      const permission = await prisma.permission.upsert({
        where: {
          resource_action: { 
            resource: group.resource, 
            action: action 
          }
        },
        update: {}, 
        create: {
          resource: group.resource,
          action: action,
          description: `Allow ${action} on ${group.resource}`
        },
      });
      
      const idObj = { id: permission.id };

      // A. EVERYONE goes to Admin
      allPermissionIds.push(idObj);

      // B. FILTER FOR SUPERVISORS
      if (group.resource === 'user' && ['read', 'update'].includes(action)) {
        supervisorPermissionIds.push(idObj);
      }
      if (group.resource === 'role' && action === 'read') {
        supervisorPermissionIds.push(idObj);
      }
      if (group.resource === 'auditLog' && action === 'read') {
        supervisorPermissionIds.push(idObj);
      }
      
    }
  }

  // --------------------------------------------------------
  // 2. CREATE ROLES
  // --------------------------------------------------------
  console.log('... Seeding Roles');

  //  ADMIN ROLE
  await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: { permissions: { set: allPermissionIds } },
    create: {
      name: 'ADMIN',
      permissions: { connect: allPermissionIds }
    }
  });

  //  SUPERVISOR ROLE
  await prisma.role.upsert({
    where: { name: 'SUPERVISOR' },
    update: { permissions: { set: supervisorPermissionIds } }, 
    create: { 
      name: 'SUPERVISOR',
      permissions: { connect: supervisorPermissionIds }
    }
  });

  // --------------------------------------------------------
  // 3. CREATE ADMIN USER (the only admin)
  // --------------------------------------------------------
  console.log('... Seeding Admin');

  const adminEmail = 'admin@anantha.com';
  const adminPhone = "1234567890"
  const hashedPassword = await bcrypt.hash('supersecret123', 10); 
  
  // We need to fetch the ID of the ADMIN role we just Upserted
  const adminRoleRef = await prisma.role.findUnique({ where: { name: 'ADMIN' }});

  if (!adminRoleRef) throw new Error("Admin role creation failed");

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: { connect: { id: adminRoleRef.id } }
    },
    create: {
      name: 'IT-ADMIN',
      phoneNumber: adminPhone,
      email: adminEmail,
      password: hashedPassword,
      status: 'ACTIVE',
      
      role: { 
        connect: { id: adminRoleRef.id } 
      }
    },
  });

  console.log(`Seeding Complete!`);
  console.log(`Login: ${adminPhone} / supersecret123`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
