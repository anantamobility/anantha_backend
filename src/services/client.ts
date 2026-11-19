import { v4 as uuidv4 } from "uuid";
import prisma from "../database/prismaClient.js";
import { InvoiceStatus, Prisma, RentalStatus } from "../generated/prisma/client.js";
import { AppError } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import type {
  ChangeClientStatusInput,
  CreateClientInput,
  ListClientsQuery,
  UpdateClientInput,
} from "../validation/client.js";

export const clientListSelect = {
  id: true,
  clientCode: true,
  type: true,
  name: true,
  companyName: true,
  contactPerson: true,
  email: true,
  phoneNumber: true,
  taxId: true,
  billingAddress: true,
  paymentTermsDays: true,
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

function generateClientCode() {
  return `CLI-${uuidv4().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function billingAddressInput(
  value: CreateClientInput["billingAddress"]
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

export async function createClient(
  input: CreateClientInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const data: Prisma.ClientUncheckedCreateInput = {
        clientCode: input.clientCode ?? generateClientCode(),
        type: input.type,
        name: input.name,
        companyName: input.companyName ?? null,
        contactPerson: input.contactPerson ?? null,
        email: input.email ?? null,
        phoneNumber: input.phoneNumber ?? null,
        taxId: input.taxId ?? null,
        paymentTermsDays: input.paymentTermsDays ?? null,
        isActive: input.isActive ?? true,
      };

      const billingAddress = billingAddressInput(input.billingAddress);
      if (billingAddress !== undefined) data.billingAddress = billingAddress;

      const client = await tx.client.create({
        data,
        select: clientDetailSelect,
      });
      const { billingAddress: _billingAddress, ...clientAudit } = client;

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Client",
        resourceId: client.id,
        newData: clientAudit,
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
  const { page, limit, search, type, isActive } = query;

  const where: Prisma.ClientWhereInput = { deletedAt: null };
  if (type) where.type = type;
  if (typeof isActive === "boolean") where.isActive = isActive;

  if (search) {
    where.OR = [
      { clientCode: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { companyName: { contains: search, mode: "insensitive" } },
      { contactPerson: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phoneNumber: { contains: search, mode: "insensitive" } },
      { taxId: { contains: search, mode: "insensitive" } },
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
      if (input.type !== undefined) data.type = input.type;
      if (input.name !== undefined) data.name = input.name;
      if (input.companyName !== undefined) {
        data.companyName = input.companyName;
      }
      if (input.contactPerson !== undefined) {
        data.contactPerson = input.contactPerson;
      }
      if (input.email !== undefined) data.email = input.email;
      if (input.phoneNumber !== undefined) data.phoneNumber = input.phoneNumber;
      if (input.taxId !== undefined) data.taxId = input.taxId;
      if (input.paymentTermsDays !== undefined) {
        data.paymentTermsDays = input.paymentTermsDays;
      }

      const billingAddress = billingAddressInput(input.billingAddress);
      if (billingAddress !== undefined) data.billingAddress = billingAddress;

      const client = await tx.client.update({
        where: { id },
        data,
        select: clientDetailSelect,
      });

      const { billingAddress: _oldBillingAddress, ...clientBefore } = existing;
      const { billingAddress: _newBillingAddress, ...clientAfter } = client;

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Client",
        resourceId: client.id,
        oldData: clientBefore,
        newData: clientAfter,
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

      const { deletedAt: _deletedAt, ...currentClient } = existing;
      const client = {
        ...currentClient,
        isActive: input.isActive,
      };
      const { billingAddress: _oldBillingAddress, ...clientBefore } = existing;
      const { billingAddress: _newBillingAddress, ...clientAfter } = client;

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Client",
        resourceId: id,
        oldData: clientBefore,
        newData: {
          ...clientAfter,
          reason: input.reason ?? null,
        },
        summary: `${actor.userName} changed client ${existing.clientCode} status to ${
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
              RentalStatus.ON_HOLD,
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

      const openInvoices = await tx.invoice.count({
        where: {
          clientId: id,
          status: {
            in: [
              InvoiceStatus.DRAFT,
              InvoiceStatus.ISSUED,
              InvoiceStatus.PARTIALLY_PAID,
              InvoiceStatus.OVERDUE,
            ],
          },
        },
      });
      if (openInvoices > 0) {
        throw new AppError(
          "Client cannot be deleted while it has open invoices",
          409
        );
      }

      const deletedAt = new Date();
      const client = await tx.client.update({
        where: { id },
        data: { deletedAt, isActive: false },
        select: clientDetailSelect,
      });

      const { billingAddress: _oldBillingAddress, ...clientBefore } = existing;
      const { billingAddress: _newBillingAddress, ...clientAfter } = client;

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "Client",
        resourceId: client.id,
        oldData: clientBefore,
        newData: clientAfter,
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
