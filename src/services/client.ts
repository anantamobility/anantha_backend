import prisma from "../database/prismaClient.js";
import {
  DepositStatus,
  Prisma,
  RentalStatus,
} from "../generated/prisma/client.js";
import { AppError } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import type {
  ChangeClientStatusInput,
  CreateClientContractInput,
  CreateClientInput,
  ListClientsQuery,
  UpdateClientContractInput,
  UpdateClientInput,
} from "../validation/client.js";

export const clientListSelect = {
  id: true,
  clientCode: true,
  name: true,
  companyName: true,
  contactPerson: true,
  email: true,
  phoneNumber: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const clientDetailSelect = {
  ...clientListSelect,
  _count: {
    select: {
      rentals: true,
      riders: true,
      invoices: true,
    },
  },
} as const;

export const clientContractSelect = {
  id: true,
  contractNumber: true,
  clientId: true,
  hubId: true,
  riderManagement: true,
  startDate: true,
  endDate: true,
  vehicleCount: true,
  vehicleModels: true,
  dailyRate: true,
  securityDeposit: true,
  billingFrequency: true,
  minBillingDays: true,
  graceDays: true,
  paymentTermsDays: true,
  replacementRules: true,
  downtimeRules: true,
  damageRecoveryRules: true,
  taxDetails: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

function contractTaxDetails(
  value: CreateClientContractInput["taxDetails"]
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

function assertContractDates(startDate: Date, endDate: Date | null) {
  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new AppError("endDate cannot be earlier than startDate", 400);
  }
}

export async function createClient(input: CreateClientInput, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const data: Prisma.ClientUncheckedCreateInput = {
        clientCode: input.clientCode ?? null,
        name: input.name,
        companyName: input.companyName ?? null,
        contactPerson: input.contactPerson ?? null,
        email: input.email ?? null,
        phoneNumber: input.phoneNumber ?? null,
        isActive: input.isActive ?? true,
      };

      const client = await tx.client.create({
        data,
        select: clientDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Client",
        resourceId: client.id,
        newData: client,
        summary: `${actor.userName} created client ${client.name}.`,
        db: tx,
        throwOnError: true,
      });

      return client;
    });
  } catch (err) {
    throw AppError.fromPrisma(
      err,
      "A client with this code or identifying details already exists"
    ) ?? err;
  }
}

export async function listClients(query: ListClientsQuery) {
  const { page, limit, search, isActive } = query;

  const where: Prisma.ClientWhereInput = { deletedAt: null };
  if (typeof isActive === "boolean") where.isActive = isActive;

  if (search) {
    where.OR = [
      { clientCode: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { companyName: { contains: search, mode: "insensitive" } },
      { contactPerson: { contains: search, mode: "insensitive" } },
    ];
  }

  const orderBy: Prisma.ClientOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [clients, total] = await Promise.all([
    prisma.client.findMany({
      where,
      select: clientListSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.client.count({ where }),
  ]);

  return {
    clients,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getClientById(id: string) {
  const client = await prisma.client.findUnique({
    where: { id },
    select: { ...clientDetailSelect, deletedAt: true },
  });

  if (!client || client.deletedAt) {
    throw new AppError("Client not found", 404);
  }

  const { deletedAt: _deletedAt, ...safeClient } = client;
  return safeClient;
}

export async function updateClient(
  id: string,
  input: UpdateClientInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.client.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Client not found", 404);
      }

      const data: Prisma.ClientUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.companyName !== undefined) {
        data.companyName = input.companyName;
      }
      if (input.contactPerson !== undefined) {
        data.contactPerson = input.contactPerson;
      }
      if (input.email !== undefined) data.email = input.email;
      if (input.phoneNumber !== undefined) data.phoneNumber = input.phoneNumber;

      const client = await tx.client.update({
        where: { id },
        data,
        select: clientDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Client",
        resourceId: client.id,
        oldData: existing,
        newData: client,
        summary: `${actor.userName} updated client ${client.name}.`,
        db: tx,
        throwOnError: true,
      });

      return client;
    });
  } catch (err) {
    throw AppError.fromPrisma(
      err,
      "A client with this code or identifying details already exists"
    ) ?? err;
  }
}

export async function changeClientStatus(
  id: string,
  input: ChangeClientStatusInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.client.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Client not found", 404);
      }

      if (existing.isActive === input.isActive) {
        throw new AppError(
          `Client is already ${input.isActive ? "active" : "inactive"}`,
          409
        );
      }

      const updateResult = await tx.client.updateMany({
        where: {
          id,
          isActive: existing.isActive,
          deletedAt: null,
        },
        data: { isActive: input.isActive },
      });

      if (updateResult.count === 0) {
        throw new AppError(
          "Client status was modified concurrently; please retry",
          409
        );
      }

      const client = {
        ...existing,
        isActive: input.isActive,
      };

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Client",
        resourceId: id,
        oldData: existing,
        newData: {
          ...client,
          reason: input.reason ?? null,
        },
        summary: `${actor.userName} changed client ${existing.clientCode ?? existing.name} status to ${
          input.isActive ? "ACTIVE" : "INACTIVE"
        }.`,
        db: tx,
        throwOnError: true,
      });

      return { client };
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Client status could not be changed") ?? err;
  }
}

export async function deleteClient(id: string, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.client.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Client not found", 404);
      }

      const activeRentals = await tx.rental.count({
        where: {
          clientId: id,
          status: {
            in: [
              RentalStatus.DRAFT,
              RentalStatus.PENDING_APPROVAL,
              RentalStatus.ACTIVE,
            ],
          },
        },
      });
      if (activeRentals > 0) {
        throw new AppError(
          "Client cannot be deleted while it has open rentals",
          409
        );
      }

      const openDeposits = await tx.deposit.count({
        where: {
          clientId: id,
          status: {
            notIn: [
              DepositStatus.REFUNDED,
              DepositStatus.FORFEITED,
              DepositStatus.CLOSED,
            ],
          },
        },
      });
      if (openDeposits > 0) {
        throw new AppError(
          "Client cannot be deleted while it has open deposits",
          409
        );
      }

      const deletedAt = new Date();
      const client = await tx.client.update({
        where: { id },
        data: { deletedAt, isActive: false },
        select: clientDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "Client",
        resourceId: client.id,
        oldData: existing,
        newData: client,
        summary: `${actor.userName} soft-deleted client ${existing.name}.`,
        db: tx,
        throwOnError: true,
      });

      return client;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Client could not be deleted") ?? err;
  }
}

export async function createClientContract(
  clientId: string,
  input: CreateClientContractInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { id: true, name: true, deletedAt: true },
      });
      if (!client || client.deletedAt) {
        throw new AppError("Client not found", 404);
      }

      if (input.hubId) {
        const hub = await tx.hub.findUnique({
          where: { id: input.hubId },
          select: { id: true },
        });
        if (!hub) throw new AppError("Hub not found", 404);
      }

      assertContractDates(input.startDate, input.endDate ?? null);

      const data: Prisma.ClientContractUncheckedCreateInput = {
        contractNumber: input.contractNumber,
        clientId,
        hubId: input.hubId ?? null,
        riderManagement: input.riderManagement,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        vehicleCount: input.vehicleCount,
        vehicleModels: input.vehicleModels,
        dailyRate: input.dailyRate,
        securityDeposit: input.securityDeposit ?? null,
        billingFrequency: input.billingFrequency,
        minBillingDays: input.minBillingDays ?? null,
        graceDays: input.graceDays ?? null,
        paymentTermsDays: input.paymentTermsDays ?? null,
        replacementRules: input.replacementRules ?? null,
        downtimeRules: input.downtimeRules ?? null,
        damageRecoveryRules: input.damageRecoveryRules ?? null,
        notes: input.notes ?? null,
      };

      const taxDetails = contractTaxDetails(input.taxDetails);
      if (taxDetails !== undefined) data.taxDetails = taxDetails;

      const contract = await tx.clientContract.create({
        data,
        select: clientContractSelect,
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "ClientContract",
        resourceId: contract.id,
        newData: contract,
        summary: `${actor.userName} created contract ${contract.contractNumber} for client ${client.name}.`,
        db: tx,
        throwOnError: true,
      });

      return contract;
    });
  } catch (err) {
    throw (
      AppError.fromPrisma(
        err,
        "A contract with this contract number already exists"
      ) ?? err
    );
  }
}

export async function updateClientContract(
  clientId: string,
  contractId: string,
  input: UpdateClientContractInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.clientContract.findFirst({
        where: { id: contractId, clientId, client: { deletedAt: null } },
      });
      if (!existing) {
        throw new AppError("Client contract not found", 404);
      }

      if (input.hubId) {
        const hub = await tx.hub.findUnique({
          where: { id: input.hubId },
          select: { id: true },
        });
        if (!hub) throw new AppError("Hub not found", 404);
      }

      assertContractDates(
        input.startDate ?? existing.startDate,
        input.endDate !== undefined ? input.endDate : existing.endDate
      );

      const data: Prisma.ClientContractUncheckedUpdateInput = {};
      if (input.hubId !== undefined) data.hubId = input.hubId;
      if (input.riderManagement !== undefined) {
        data.riderManagement = input.riderManagement;
      }
      if (input.startDate !== undefined) data.startDate = input.startDate;
      if (input.endDate !== undefined) data.endDate = input.endDate;
      if (input.vehicleCount !== undefined) {
        data.vehicleCount = input.vehicleCount;
      }
      if (input.vehicleModels !== undefined) {
        data.vehicleModels = input.vehicleModels;
      }
      if (input.dailyRate !== undefined) data.dailyRate = input.dailyRate;
      if (input.securityDeposit !== undefined) {
        data.securityDeposit = input.securityDeposit;
      }
      if (input.billingFrequency !== undefined) {
        data.billingFrequency = input.billingFrequency;
      }
      if (input.minBillingDays !== undefined) {
        data.minBillingDays = input.minBillingDays;
      }
      if (input.graceDays !== undefined) data.graceDays = input.graceDays;
      if (input.paymentTermsDays !== undefined) {
        data.paymentTermsDays = input.paymentTermsDays;
      }
      if (input.replacementRules !== undefined) {
        data.replacementRules = input.replacementRules;
      }
      if (input.downtimeRules !== undefined) {
        data.downtimeRules = input.downtimeRules;
      }
      if (input.damageRecoveryRules !== undefined) {
        data.damageRecoveryRules = input.damageRecoveryRules;
      }
      if (input.notes !== undefined) data.notes = input.notes;

      const taxDetails = contractTaxDetails(input.taxDetails);
      if (taxDetails !== undefined) data.taxDetails = taxDetails;

      const contract = await tx.clientContract.update({
        where: { id: contractId },
        data,
        select: clientContractSelect,
      });

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "ClientContract",
        resourceId: contract.id,
        oldData: existing,
        newData: contract,
        summary: `${actor.userName} updated contract ${contract.contractNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return contract;
    });
  } catch (err) {
    throw (
      AppError.fromPrisma(err, "Client contract could not be updated") ?? err
    );
  }
}
