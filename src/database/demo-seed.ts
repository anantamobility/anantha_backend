import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import bcrypt from "bcryptjs";
import prisma from "./prismaClient.js";

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD || "DemoPassword123";

const USERS = {
  admin: { name: "Demo Administrator", email: "demo.admin@anantha.local", phone: "9000000000" },
  supervisor: { name: "Demo Supervisor", email: "demo.supervisor@anantha.local", phone: "9000000001" },
  operator: { name: "Demo Operator", email: "demo.operator@anantha.local", phone: "9000000002" },
};

async function upsertUser(
  input: { name: string; email: string; phone: string },
  roleId: string
) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email: input.email },
    update: {
      name: input.name,
      phoneNumber: input.phone,
      status: "ACTIVE",
      deletedAt: null,
      roleId,
    },
    create: {
      name: input.name,
      email: input.email,
      phoneNumber: input.phone,
      passwordHash,
      status: "ACTIVE",
      roleId,
    },
  });
}

async function main() {
  console.log("Starting demo seed...");

  const roles = await prisma.role.findMany({ where: { name: { in: ["ADMIN", "SUPERVISOR", "OPERATOR"] } } });
  const roleByName = new Map(roles.map((role) => [role.name, role]));
  for (const name of ["ADMIN", "SUPERVISOR", "OPERATOR"]) {
    if (!roleByName.has(name)) {
      throw new Error(`Role ${name} is missing. Run "npm run seed" first.`);
    }
  }

  const admin = await upsertUser(USERS.admin, roleByName.get("ADMIN")!.id);
  const supervisor = await upsertUser(USERS.supervisor, roleByName.get("SUPERVISOR")!.id);
  const operator = await upsertUser(USERS.operator, roleByName.get("OPERATOR")!.id);

  const blrHub = await prisma.hub.upsert({
    where: { code: "BLR-CENTRAL" },
    update: { name: "Bengaluru Central", isActive: true },
    create: {
      name: "Bengaluru Central",
      code: "BLR-CENTRAL",
      contactEmail: "blr@anantha.local",
      contactPhone: "+919800000001",
      address: { city: "Bengaluru", state: "Karnataka", country: "India" },
    },
  });
  const mysHub = await prisma.hub.upsert({
    where: { code: "MYS-CENTRAL" },
    update: { name: "Mysuru Central", isActive: true },
    create: {
      name: "Mysuru Central",
      code: "MYS-CENTRAL",
      contactEmail: "mys@anantha.local",
      contactPhone: "+919800000002",
      address: { city: "Mysuru", state: "Karnataka", country: "India" },
    },
  });

  await prisma.staff.upsert({
    where: { userId: supervisor.id },
    update: { fullName: supervisor.name, hubId: blrHub.id, status: "ACTIVE", deletedAt: null },
    create: {
      userId: supervisor.id,
      employeeCode: "EMP-DEMO-001",
      fullName: supervisor.name,
      phoneNumber: supervisor.phoneNumber,
      hubId: blrHub.id,
      jobTitle: "Operations Supervisor",
      status: "ACTIVE",
    },
  });
  await prisma.staff.upsert({
    where: { userId: operator.id },
    update: { fullName: operator.name, hubId: mysHub.id, status: "ACTIVE", deletedAt: null },
    create: {
      userId: operator.id,
      employeeCode: "EMP-DEMO-002",
      fullName: operator.name,
      phoneNumber: operator.phoneNumber,
      hubId: mysHub.id,
      jobTitle: "Hub Operator",
      status: "ACTIVE",
    },
  });

  const acme = await prisma.client.upsert({
    where: { clientCode: "DEMO-ACME" },
    update: { name: "Acme Logistics", isActive: true, deletedAt: null },
    create: {
      clientCode: "DEMO-ACME",
      type: "CORPORATE",
      name: "Acme Logistics",
      companyName: "Acme Logistics Pvt Ltd",
      contactPerson: "Priya Rao",
      email: "ops@acme.demo",
      phoneNumber: "+919800000010",
      paymentTermsDays: 15,
      billingAddress: { city: "Bengaluru", state: "Karnataka", country: "India" },
      isActive: true,
    },
  });
  const individual = await prisma.client.upsert({
    where: { clientCode: "DEMO-INDIVIDUAL" },
    update: { name: "Demo Individual Client", isActive: true, deletedAt: null },
    create: {
      clientCode: "DEMO-INDIVIDUAL",
      type: "INDIVIDUAL",
      name: "Demo Individual Client",
      email: "individual@anantha.demo",
      phoneNumber: "+919800000011",
      isActive: true,
    },
  });

  const b2cRate = await prisma.rateCard.upsert({
    where: { code: "DEMO-BIKE-B2C" },
    update: { isActive: true, deletedAt: null },
    create: {
      code: "DEMO-BIKE-B2C",
      name: "Demo B2C Bike Weekly",
      vehicleCategory: "BIKE",
      rentalType: "B2C",
      billingFrequency: "WEEKLY",
      dailyRate: "250.0000",
      weeklyRate: "1500.0000",
      securityDeposit: "3000.00",
      currency: "INR",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      isActive: true,
    },
  });
  const b2bRate = await prisma.rateCard.upsert({
    where: { code: "DEMO-SCOOTER-B2B" },
    update: { isActive: true, deletedAt: null },
    create: {
      code: "DEMO-SCOOTER-B2B",
      name: "Demo B2B Scooter Weekly",
      vehicleCategory: "SCOOTER",
      rentalType: "B2B",
      billingFrequency: "WEEKLY",
      dailyRate: "300.0000",
      weeklyRate: "1800.0000",
      securityDeposit: "3500.00",
      currency: "INR",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      isActive: true,
    },
  });

  const existingAssignment = await prisma.rateCardAssignment.findFirst({
    where: { clientId: acme.id, rateCardId: b2bRate.id },
  });
  if (!existingAssignment) {
    await prisma.rateCardAssignment.create({
      data: {
        clientId: acme.id,
        rateCardId: b2bRate.id,
        status: "ACTIVE",
        assignedById: admin.id,
        validFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  }

  await prisma.rider.upsert({
    where: { riderCode: "RDR-DEMO-001" },
    update: { status: "ACTIVE", hubId: blrHub.id, deletedAt: null },
    create: {
      riderCode: "RDR-DEMO-001",
      fullName: "Demo B2C Rider",
      phoneNumber: "+919800000021",
      email: "rider.b2c@anantha.demo",
      rentalType: "B2C",
      b2cMode: "INDIVIDUAL_RIDER",
      hubId: blrHub.id,
      status: "ACTIVE",
      onboardedAt: new Date("2026-01-05T00:00:00.000Z"),
      createdById: admin.id,
    },
  });
  await prisma.rider.upsert({
    where: { riderCode: "RDR-DEMO-002" },
    update: { status: "ACTIVE", hubId: blrHub.id, clientId: acme.id, deletedAt: null },
    create: {
      riderCode: "RDR-DEMO-002",
      fullName: "Demo B2B Rider",
      phoneNumber: "+919800000022",
      email: "rider.b2b@anantha.demo",
      rentalType: "B2B",
      b2bRiderMgmt: "CLIENT_MANAGED",
      clientId: acme.id,
      hubId: blrHub.id,
      status: "ACTIVE",
      onboardedAt: new Date("2026-01-05T00:00:00.000Z"),
      createdById: admin.id,
    },
  });

  const vehicles = [
    { registrationNumber: "KA01DEMO1", hubId: blrHub.id, make: "Honda", model: "Activa", year: 2025 },
    { registrationNumber: "KA01DEMO2", hubId: blrHub.id, make: "TVS", model: "Jupiter", year: 2024 },
    { registrationNumber: "KA09DEMO1", hubId: mysHub.id, make: "Bajaj", model: "Chetak", year: 2025 },
  ];
  for (const vehicle of vehicles) {
    await prisma.vehicle.upsert({
      where: { registrationNumber: vehicle.registrationNumber },
      update: { hubId: vehicle.hubId, isActive: true, deletedAt: null },
      create: {
        ...vehicle,
        status: "IDLE",
        isActive: true,
        acquiredAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
  }
  console.log("Demo seed complete.");
  console.log(`Demo login: ${USERS.admin.phone} / ${DEMO_PASSWORD}`);
  console.log(`Demo data: 2 hubs, 2 clients, 2 ratecards, 2 riders, 3 vehicles, 3 staff users.`);
  console.log(`Unused demo individual client id: ${individual.id} (available for manual rentals).`);
}

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
