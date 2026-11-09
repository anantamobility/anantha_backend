import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import type {
  AdjustStockInput,
  DamagedStockInput,
  ListInventoryBalancesQuery,
  ListInventoryMovementsQuery,
  ListLowStockQuery,
  OpeningStockInput,
  ServiceConsumptionInput,
  ServiceReturnInput,
  StockInInput,
} from "../validation/inventory.js";

type Tx = Prisma.TransactionClient;

const CONSUMABLE_SERVICE_STATUSES = [
  "REPORTED",
  "APPROVED",
  "IN_PROGRESS",
  "AWAITING_PARTS",
] as const;

const OUTBOUND_TYPES = [
  "SERVICE_CONSUMPTION",
  "DAMAGED_STOCK",
  "WRITE_OFF",
  "ISSUE_TO_SERVICE",
] as const;

export const spareSelect = {
  id: true,
  partNumber: true,
  name: true,
  category: true,
  description: true,
  unitOfMeasure: true,
  purchasePrice: true,
  unitCost: true,
  minimumStock: true,
  currency: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const inventoryMovementSelect = {
  id: true,
  spareId: true,
  movementType: true,
  quantity: true,
  quantityDelta: true,
  unitCost: true,
  hubId: true,
  fromHubId: true,
  toHubId: true,
  serviceId: true,
  vehicleId: true,
  movedById: true,
  referenceType: true,
  referenceId: true,
  idempotencyKey: true,
  notes: true,
  movedAt: true,
  createdAt: true,
  spare: { select: { id: true, partNumber: true, name: true, unitOfMeasure: true } },
  hub: { select: { id: true, name: true, code: true } },
  movedBy: { select: { id: true, name: true } },
} as const;

export const inventoryBalanceSelect = {
  id: true,
  spareId: true,
  hubId: true,
  onHand: true,
  reserved: true,
  updatedAt: true,
  spare: {
    select: {
      id: true,
      partNumber: true,
      name: true,
      category: true,
      unitOfMeasure: true,
      minimumStock: true,
      unitCost: true,
      currency: true,
      isActive: true,
    },
  },
  hub: { select: { id: true, name: true, code: true } },
} as const;

function withSku<T extends { partNumber: string }>(spare: T) {
  return { ...spare, sku: spare.partNumber };
}

function isOutbound(type: string) {
  return (OUTBOUND_TYPES as readonly string[]).includes(type);
}

export function movementDelta(type: string, quantity: number): number {
  if (isOutbound(type)) return -Math.abs(quantity);
  if (
    [
      "PURCHASE",
      "RETURN",
      "OPENING_STOCK",
      "PURCHASE_IN",
      "SERVICE_RETURN",
    ].includes(type)
  ) {
    return Math.abs(quantity);
  }
  // MANUAL_ADJUSTMENT / ADJUSTMENT carry their direction in the caller.
  return quantity;
}

async function assertHub(tx: Tx, hubId: string) {
  const hub = await tx.hub.findUnique({
    where: { id: hubId },
    select: { id: true, isActive: true },
  });
  if (!hub) {
    throw new AppError("Hub not found", 404, ErrorCode.NOT_FOUND);
  }
  if (!hub.isActive) {
    throw new AppError(
      "Hub is inactive and cannot hold inventory movements",
      409,
      ErrorCode.CONFLICT
    );
  }
  return hub;
}

async function assertSpare(
  tx: Tx,
  spareId: string,
  options: { requireActive?: boolean } = {}
) {
  const spare = await tx.spare.findUnique({
    where: { id: spareId },
    select: { id: true, partNumber: true, name: true, unitCost: true, isActive: true },
  });
  if (!spare) {
    throw new AppError("Spare not found", 404, ErrorCode.NOT_FOUND);
  }
  if (options.requireActive && !spare.isActive) {
    throw new AppError(
      "Spare is inactive and cannot be used for this operation",
      409,
      ErrorCode.CONFLICT
    );
  }
  return spare;
}

async function applyInbound(
  tx: Tx,
  spareId: string,
  hubId: string,
  quantity: number
) {
  await tx.inventoryBalance.upsert({
    where: { spareId_hubId: { spareId, hubId } },
    create: {
      spareId,
      hubId,
      onHand: quantity,
      reserved: 0,
    },
    update: {
      onHand: { increment: quantity },
    },
  });
}

async function applyOutbound(
  tx: Tx,
  spareId: string,
  hubId: string,
  quantity: number
) {
  const result = await tx.inventoryBalance.updateMany({
    where: {
      spareId,
      hubId,
      onHand: { gte: quantity },
    },
    data: {
      onHand: { decrement: quantity },
    },
  });

  if (result.count === 0) {
    throw new AppError(
      "Insufficient stock for this spare at the selected hub",
      409,
      ErrorCode.CONFLICT
    );
  }
}

export type MovementInput = {
  spareId: string;
  hubId: string;
  movementType:
    | "OPENING_STOCK"
    | "PURCHASE_IN"
    | "SERVICE_CONSUMPTION"
    | "MANUAL_ADJUSTMENT"
    | "SERVICE_RETURN"
    | "DAMAGED_STOCK";
  quantity: number;
  direction: "IN" | "OUT";
  unitCost?: string | null;
  serviceId?: string | null;
  vehicleId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  notes?: string | null;
  movedAt?: Date;
  requireActiveSpare?: boolean;
};

export async function recordInventoryMovement(
  tx: Tx,
  input: MovementInput,
  actor: AuditActor
) {
  if (input.idempotencyKey) {
    const existing = await tx.inventoryMovement.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: inventoryMovementSelect,
    });
    if (existing) {
      return { movement: existing, duplicate: true };
    }
  }

  await assertHub(tx, input.hubId);
  await assertSpare(tx, input.spareId, {
    requireActive: input.requireActiveSpare,
  });

  const quantity = Math.abs(input.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(
      "quantity must be a positive integer",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const delta = input.direction === "IN" ? quantity : -quantity;

  if (input.direction === "IN") {
    await applyInbound(tx, input.spareId, input.hubId, quantity);
  } else {
    await applyOutbound(tx, input.spareId, input.hubId, quantity);
  }

  const movement = await tx.inventoryMovement.create({
    data: {
      spareId: input.spareId,
      movementType: input.movementType,
      quantity,
      quantityDelta: delta,
      unitCost: input.unitCost ?? null,
      hubId: input.hubId,
      fromHubId: input.direction === "OUT" ? input.hubId : null,
      toHubId: input.direction === "IN" ? input.hubId : null,
      serviceId: input.serviceId ?? null,
      vehicleId: input.vehicleId ?? null,
      movedById: actor.userId,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      notes: input.notes ?? null,
      ...(input.movedAt ? { movedAt: input.movedAt } : {}),
    },
    select: inventoryMovementSelect,
  });

  return { movement, duplicate: false };
}

export async function createSpare(
  input: {
    sku: string;
    name: string;
    category?: string | null;
    description?: string | null;
    unitOfMeasure?: string;
    purchasePrice?: string | null;
    unitCost: string;
    minimumStock?: number;
    currency?: string;
  },
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const spare = await tx.spare.create({
        data: {
          partNumber: input.sku,
          name: input.name,
          category: input.category ?? null,
          description: input.description ?? null,
          unitOfMeasure: input.unitOfMeasure ?? "UNIT",
          purchasePrice: input.purchasePrice
            ? new Prisma.Decimal(input.purchasePrice)
            : null,
          unitCost: new Prisma.Decimal(input.unitCost),
          minimumStock: input.minimumStock ?? 0,
          currency: input.currency ?? "INR",
        },
        select: spareSelect,
      });

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "Spare",
        resourceId: spare.id,
        newData: withSku(spare),
        summary: `${actor.userName} created spare ${spare.partNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return withSku(spare);
    });
  } catch (err) {
    rethrowPrismaError(err, "A spare with this SKU already exists");
  }
}

export async function listSpares(query: {
  page: number;
  limit: number;
  search?: string;
  category?: string;
  isActive?: boolean;
  sortBy: string;
  sortOrder: "asc" | "desc";
}) {
  const { page, limit, search, category, isActive } = query;

  const where: Prisma.SpareWhereInput = {};
  if (category) where.category = category;
  if (typeof isActive === "boolean") where.isActive = isActive;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { partNumber: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
    ];
  }

  const sortBy = query.sortBy === "sku" ? "partNumber" : query.sortBy;
  const orderBy: Prisma.SpareOrderByWithRelationInput = {
    [sortBy]: query.sortOrder,
  };

  const [spares, total] = await Promise.all([
    prisma.spare.findMany({
      where,
      select: spareSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.spare.count({ where }),
  ]);

  return {
    spares: spares.map(withSku),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getSpareById(id: string) {
  const spare = await prisma.spare.findUnique({
    where: { id },
    select: spareSelect,
  });
  if (!spare) {
    throw new AppError("Spare not found", 404, ErrorCode.NOT_FOUND);
  }
  return withSku(spare);
}

export async function updateSpare(
  id: string,
  input: {
    sku?: string;
    name?: string;
    category?: string | null;
    description?: string | null;
    unitOfMeasure?: string;
    purchasePrice?: string | null;
    unitCost?: string;
    minimumStock?: number;
    currency?: string;
  },
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.spare.findUnique({ where: { id } });
      if (!existing) {
        throw new AppError("Spare not found", 404, ErrorCode.NOT_FOUND);
      }

      const data: Prisma.SpareUncheckedUpdateInput = {};
      if (input.sku !== undefined) data.partNumber = input.sku;
      if (input.name !== undefined) data.name = input.name;
      if (input.category !== undefined) data.category = input.category;
      if (input.description !== undefined) data.description = input.description;
      if (input.unitOfMeasure !== undefined) {
        data.unitOfMeasure = input.unitOfMeasure;
      }
      if (input.purchasePrice !== undefined) {
        data.purchasePrice =
          input.purchasePrice === null
            ? null
            : new Prisma.Decimal(input.purchasePrice);
      }
      if (input.unitCost !== undefined) {
        data.unitCost = new Prisma.Decimal(input.unitCost);
      }
      if (input.minimumStock !== undefined) {
        data.minimumStock = input.minimumStock;
      }
      if (input.currency !== undefined) data.currency = input.currency;

      const spare = await tx.spare.update({
        where: { id },
        data,
        select: spareSelect,
      });

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "Spare",
        resourceId: spare.id,
        oldData: withSku(existing as any),
        newData: withSku(spare),
        summary: `${actor.userName} updated spare ${spare.partNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return withSku(spare);
    });
  } catch (err) {
    rethrowPrismaError(err, "A spare with this SKU already exists");
  }
}

export async function changeSpareStatus(
  id: string,
  input: { isActive: boolean; reason?: string },
  actor: AuditActor
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.spare.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError("Spare not found", 404, ErrorCode.NOT_FOUND);
    }

    const spare = await tx.spare.update({
      where: { id },
      data: { isActive: input.isActive },
      select: spareSelect,
    });

    await logAudit({
      ...actor,
      action: "UPDATE",
      resource: "Spare",
      resourceId: spare.id,
      oldData: { isActive: existing.isActive },
      newData: { isActive: spare.isActive, reason: input.reason ?? null },
      summary: `${actor.userName} ${spare.isActive ? "activated" : "deactivated"} spare ${spare.partNumber}.`,
      db: tx,
      throwOnError: true,
    });

    return withSku(spare);
  });
}

async function runInventoryOperation(
  actor: AuditActor,
  operation: (tx: Tx) => Promise<unknown>
) {
  try {
    return await prisma.$transaction(operation);
  } catch (err) {
    rethrowPrismaError(err, "Inventory operation could not be completed");
  }
}

export async function recordOpeningStock(
  input: OpeningStockInput,
  actor: AuditActor
) {
  return runInventoryOperation(actor, async (tx) => {
    const result = await recordInventoryMovement(
      tx,
      {
        spareId: input.spareId,
        hubId: input.hubId,
        movementType: "OPENING_STOCK",
        quantity: input.quantity,
        direction: "IN",
        unitCost: input.unitCost ?? null,
        idempotencyKey:
          input.idempotencyKey ?? `opening-stock:${input.spareId}:${input.hubId}`,
        notes: input.reason ?? input.notes ?? null,
        movedAt: input.movedAt,
      },
      actor
    );

    await logAudit({
      ...actor,
      action: "STOCK_OPENING",
      resource: "Inventory",
      resourceId: result.movement.id,
      newData: result.movement,
      summary: `${actor.userName} recorded opening stock for spare ${input.spareId} at hub ${input.hubId}.`,
      db: tx,
      throwOnError: true,
    });

    return result;
  });
}

export async function recordStockIn(input: StockInInput, actor: AuditActor) {
  return runInventoryOperation(actor, async (tx) => {
    const result = await recordInventoryMovement(
      tx,
      {
        spareId: input.spareId,
        hubId: input.hubId,
        movementType: "PURCHASE_IN",
        quantity: input.quantity,
        direction: "IN",
        unitCost: input.unitCost ?? null,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        notes: input.notes ?? null,
        movedAt: input.movedAt,
      },
      actor
    );

    await logAudit({
      ...actor,
      action: "STOCK_IN",
      resource: "Inventory",
      resourceId: result.movement.id,
      newData: result.movement,
      summary: `${actor.userName} recorded stock in for spare ${input.spareId}.`,
      db: tx,
      throwOnError: true,
    });

    return result;
  });
}

export async function recordAdjustment(
  input: AdjustStockInput,
  actor: AuditActor
) {
  return runInventoryOperation(actor, async (tx) => {
    const result = await recordInventoryMovement(
      tx,
      {
        spareId: input.spareId,
        hubId: input.hubId,
        movementType: "MANUAL_ADJUSTMENT",
        quantity: input.quantity,
        direction: input.direction,
        unitCost: input.unitCost ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        notes: input.reason,
        movedAt: input.movedAt,
      },
      actor
    );

    await logAudit({
      ...actor,
      action: "STOCK_ADJUSTMENT",
      resource: "Inventory",
      resourceId: result.movement.id,
      newData: { ...result.movement, reason: input.reason },
      summary: `${actor.userName} adjusted spare ${input.spareId} stock ${input.direction} by ${input.quantity}.`,
      db: tx,
      throwOnError: true,
    });

    return result;
  });
}

export async function recordDamagedStock(
  input: DamagedStockInput,
  actor: AuditActor
) {
  return runInventoryOperation(actor, async (tx) => {
    const result = await recordInventoryMovement(
      tx,
      {
        spareId: input.spareId,
        hubId: input.hubId,
        movementType: "DAMAGED_STOCK",
        quantity: input.quantity,
        direction: "OUT",
        unitCost: input.unitCost ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        notes: input.reason ?? input.notes ?? null,
        movedAt: input.movedAt,
      },
      actor
    );

    await logAudit({
      ...actor,
      action: "STOCK_DAMAGED",
      resource: "Inventory",
      resourceId: result.movement.id,
      newData: { ...result.movement, reason: input.reason },
      summary: `${actor.userName} wrote off ${input.quantity} damaged stock for spare ${input.spareId}.`,
      db: tx,
      throwOnError: true,
    });

    return result;
  });
}

export function deriveServiceChargeAllocation(input: {
  responsibility: string;
  amount: Prisma.Decimal;
}) {
  const { responsibility, amount } = input;
  if (responsibility === "UNKNOWN") {
    return {
      billableAmount: new Prisma.Decimal(0),
      status: "PENDING" as const,
      recoverableFrom: responsibility,
    };
  }
  if (responsibility === "AML") {
    return {
      billableAmount: new Prisma.Decimal(0),
      status: "BILLED" as const,
      recoverableFrom: responsibility,
    };
  }
  return {
    billableAmount: amount,
    status: "BILLED" as const,
    recoverableFrom: responsibility,
  };
}

export async function consumeSpareForService(
  tx: Tx,
  input: ServiceConsumptionInput,
  actor: AuditActor
) {
  const service = await tx.service.findUnique({
    where: { id: input.serviceId },
    select: {
      id: true,
      serviceNumber: true,
      status: true,
      responsibleParty: true,
      vehicleId: true,
      vehicle: { select: { hubId: true } },
    },
  });

  if (!service) {
    throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
  }
  if (
    !CONSUMABLE_SERVICE_STATUSES.includes(
      service.status as (typeof CONSUMABLE_SERVICE_STATUSES)[number]
    )
  ) {
    throw new AppError(
      `Spare parts cannot be consumed for a service in status ${service.status}`,
      409,
      ErrorCode.CONFLICT
    );
  }

  const spare = await assertSpare(tx, input.spareId, { requireActive: true });

  const hubId = input.hubId ?? service.vehicle.hubId;
  if (!hubId) {
    throw new AppError(
      "A hubId is required because the vehicle has no hub and no hubId was supplied",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const idempotencyKey =
    input.idempotencyKey ??
    `service-consume:${input.serviceId}:${input.spareId}:${input.quantity}`;

  const existing = await tx.serviceSpare.findUnique({
    where: { idempotencyKey },
    select: {
      id: true,
      serviceId: true,
      spareId: true,
      quantity: true,
      unitCost: true,
      lineCost: true,
      inventoryMovementId: true,
      createdAt: true,
    },
  });

  if (existing) {
    return { serviceSpare: existing, duplicate: true };
  }

  const unitCost = new Prisma.Decimal(input.unitCost ?? spare.unitCost);
  const lineCost = unitCost.mul(input.quantity).toDecimalPlaces(2);

  const movementResult = await recordInventoryMovement(
    tx,
    {
      spareId: input.spareId,
      hubId,
      movementType: "SERVICE_CONSUMPTION",
      quantity: input.quantity,
      direction: "OUT",
      unitCost: unitCost.toString(),
      serviceId: service.id,
      vehicleId: service.vehicleId,
      idempotencyKey: `movement:${idempotencyKey}`,
      notes: input.notes ?? null,
    },
    actor
  );

  const serviceSpare = await tx.serviceSpare.create({
    data: {
      serviceId: service.id,
      spareId: input.spareId,
      quantity: input.quantity,
      unitCost,
      lineCost,
      idempotencyKey,
      inventoryMovementId: movementResult.movement.id,
    },
    select: {
      id: true,
      serviceId: true,
      spareId: true,
      quantity: true,
      unitCost: true,
      lineCost: true,
      inventoryMovementId: true,
      createdAt: true,
    },
  });

  const allocation = deriveServiceChargeAllocation({
    responsibility: service.responsibleParty,
    amount: lineCost,
  });

  await tx.serviceCharge.create({
    data: {
      serviceId: service.id,
      chargeType: "SPARE_PARTS",
      costAmount: lineCost,
      billableAmount: allocation.billableAmount,
      recoverableFrom: allocation.recoverableFrom as
        | "AML"
        | "RIDER"
        | "CLIENT"
        | "THIRD_PARTY"
        | "INSURANCE"
        | "UNKNOWN",
      status: allocation.status,
      description: `Spare consumption: ${spare.partNumber} x ${input.quantity}`,
      sourceType: "ServiceSpare",
      sourceId: serviceSpare.id,
      serviceSpareId: serviceSpare.id,
      idempotencyKey: `spare-charge:${serviceSpare.id}`,
    },
  });

  await logAudit({
    ...actor,
    action: "SPARE_CONSUMED",
    resource: "Service",
    resourceId: service.id,
    newData: {
      serviceNumber: service.serviceNumber,
      serviceSpare,
      hubId,
      movementId: movementResult.movement.id,
    },
    summary: `${actor.userName} consumed ${input.quantity} x ${spare.partNumber} against service ${service.serviceNumber}.`,
    db: tx,
    throwOnError: true,
  });

  return { serviceSpare, duplicate: false };
}

export async function consumeSpare(
  input: ServiceConsumptionInput,
  actor: AuditActor
) {
  return runInventoryOperation(actor, async (tx) =>
    consumeSpareForService(tx, input, actor)
  );
}

export async function returnServiceSpare(
  input: ServiceReturnInput,
  actor: AuditActor
) {
  return runInventoryOperation(actor, async (tx) => {
    const service = await tx.service.findUnique({
      where: { id: input.serviceId },
      select: {
        id: true,
        serviceNumber: true,
        status: true,
        vehicleId: true,
        vehicle: { select: { hubId: true } },
      },
    });

    if (!service) {
      throw new AppError("Service order not found", 404, ErrorCode.NOT_FOUND);
    }
    if (["CLOSED", "CANCELLED"].includes(service.status)) {
      throw new AppError(
        `Spare parts cannot be returned for a service in status ${service.status}`,
        409,
        ErrorCode.CONFLICT
      );
    }

    const spare = await assertSpare(tx, input.spareId);

    const hubId = input.hubId ?? service.vehicle.hubId;
    if (!hubId) {
      throw new AppError(
        "A hubId is required because the vehicle has no hub and no hubId was supplied",
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }

    const idempotencyKey =
      input.idempotencyKey ??
      `service-return:${input.serviceId}:${input.spareId}:${input.quantity}`;

    const existing = await tx.serviceSpare.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) {
      return { serviceSpare: existing, duplicate: true };
    }

    const unitCost = new Prisma.Decimal(input.unitCost ?? spare.unitCost);
    const lineCost = unitCost.mul(input.quantity).toDecimalPlaces(2).neg();

    const movementResult = await recordInventoryMovement(
      tx,
      {
        spareId: input.spareId,
        hubId,
        movementType: "SERVICE_RETURN",
        quantity: input.quantity,
        direction: "IN",
        unitCost: unitCost.toString(),
        serviceId: service.id,
        vehicleId: service.vehicleId,
        idempotencyKey: `movement:${idempotencyKey}`,
        notes: input.reason ?? input.notes ?? null,
      },
      actor
    );

    const serviceSpare = await tx.serviceSpare.create({
      data: {
        serviceId: service.id,
        spareId: input.spareId,
        quantity: -Math.abs(input.quantity),
        unitCost,
        lineCost,
        idempotencyKey,
        inventoryMovementId: movementResult.movement.id,
      },
      select: {
        id: true,
        serviceId: true,
        spareId: true,
        quantity: true,
        unitCost: true,
        lineCost: true,
        inventoryMovementId: true,
        createdAt: true,
      },
    });

    await logAudit({
      ...actor,
      action: "SPARE_RETURNED",
      resource: "Service",
      resourceId: service.id,
      newData: { serviceNumber: service.serviceNumber, serviceSpare, hubId },
      summary: `${actor.userName} returned ${input.quantity} x ${spare.partNumber} from service ${service.serviceNumber}.`,
      db: tx,
      throwOnError: true,
    });

    return { serviceSpare, duplicate: false };
  });
}

export async function listInventoryBalances(query: ListInventoryBalancesQuery) {
  const { page, limit } = query;
  const where: Prisma.InventoryBalanceWhereInput = {};
  if (query.spareId) where.spareId = query.spareId;
  if (query.hubId) where.hubId = query.hubId;

  const orderBy: Prisma.InventoryBalanceOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const balances = await prisma.inventoryBalance.findMany({
    where,
    select: inventoryBalanceSelect,
    orderBy,
  });

  const filtered =
    query.lowStock === true
      ? balances.filter((balance) => balance.onHand <= balance.spare.minimumStock)
      : balances;

  const total = filtered.length;
  const paged = filtered.slice((page - 1) * limit, page * limit);

  return {
    balances: paged,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function listInventoryMovements(
  query: ListInventoryMovementsQuery
) {
  const { page, limit } = query;
  const where: Prisma.InventoryMovementWhereInput = {};
  if (query.spareId) where.spareId = query.spareId;
  if (query.hubId) where.hubId = query.hubId;
  if (query.serviceId) where.serviceId = query.serviceId;
  if (query.movementType) where.movementType = query.movementType;
  if (query.from || query.to) {
    where.movedAt = {};
    if (query.from) where.movedAt.gte = query.from;
    if (query.to) where.movedAt.lte = query.to;
  }

  const orderBy: Prisma.InventoryMovementOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [movements, total] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      select: inventoryMovementSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.inventoryMovement.count({ where }),
  ]);

  return {
    movements,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getSpareMovements(
  spareId: string,
  query: ListInventoryMovementsQuery
) {
  const spare = await prisma.spare.findUnique({
    where: { id: spareId },
    select: { id: true, partNumber: true, name: true, unitOfMeasure: true },
  });
  if (!spare) {
    throw new AppError("Spare not found", 404, ErrorCode.NOT_FOUND);
  }

  const result = await listInventoryMovements({ ...query, spareId });

  const totals = await prisma.inventoryMovement.aggregate({
    where: { spareId },
    _sum: { quantityDelta: true },
  });

  return {
    spare: withSku(spare),
    ...result,
    derivedBalance: totals._sum.quantityDelta ?? 0,
  };
}

export async function getStockBalance(spareId: string, hubId: string) {
  const [spare, balance, totals] = await Promise.all([
    prisma.spare.findUnique({
      where: { id: spareId },
      select: spareSelect,
    }),
    prisma.inventoryBalance.findUnique({
      where: { spareId_hubId: { spareId, hubId } },
      select: inventoryBalanceSelect,
    }),
    prisma.inventoryMovement.aggregate({
      where: { spareId, hubId },
      _sum: { quantityDelta: true },
    }),
  ]);

  if (!spare) {
    throw new AppError("Spare not found", 404, ErrorCode.NOT_FOUND);
  }

  return {
    spare: withSku(spare),
    hubId,
    cachedOnHand: balance?.onHand ?? 0,
    reserved: balance?.reserved ?? 0,
    derivedBalance: totals._sum.quantityDelta ?? 0,
  };
}

export async function listLowStock(query: ListLowStockQuery) {
  const where: Prisma.InventoryBalanceWhereInput = {};
  if (query.hubId) where.hubId = query.hubId;

  const balances = await prisma.inventoryBalance.findMany({
    where,
    select: inventoryBalanceSelect,
    orderBy: [{ onHand: "asc" }, { updatedAt: "desc" }],
  });

  const lowStock = balances.filter(
    (balance) => balance.onHand <= balance.spare.minimumStock
  );

  const total = lowStock.length;
  const { page, limit } = query;

  return {
    lowStock: lowStock.slice((page - 1) * limit, page * limit),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
