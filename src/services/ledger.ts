import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import { toDecimal } from "./rental-schedule.js";
import type {
  AdjustDepositInput,
  DepositLedgerQuery,
  ReceiveDepositInput,
  RefundDepositInput,
} from "../validation/deposit.js";

type Tx = Prisma.TransactionClient;

export const depositSelect = {
  id: true,
  payerType: true,
  clientId: true,
  riderId: true,
  rentalId: true,
  amountRequired: true,
  currency: true,
  status: true,
  dueDate: true,
  version: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

const depositTransactionUserSelect = {
  id: true,
  name: true,
} as const;

function deriveDepositStatus(input: {
  required: Prisma.Decimal;
  credits: Prisma.Decimal;
  debits: Prisma.Decimal;
  balance: Prisma.Decimal;
}) {
  const { required, credits, debits, balance } = input;
  if (required.lte(0) && credits.lte(0) && debits.lte(0)) return "CLOSED";

  if (balance.lte(0)) {
    if (debits.gt(0)) return "REFUNDED";
    return required.gt(0) ? "PENDING_RECEIPT" : "CLOSED";
  }

  if (balance.lt(required)) {
    return debits.gt(0) ? "PARTIALLY_REFUNDED" : "PARTIALLY_RECEIVED";
  }

  return "RECEIVED";
}

async function depositTotals(tx: Tx, depositId: string) {
  const rows = await tx.depositTransaction.findMany({
    where: { depositId },
    select: { direction: true, amount: true },
  });

  return rows.reduce(
    (acc, row) => {
      if (row.direction === "CREDIT") acc.credits = acc.credits.add(toDecimal(row.amount));
      else acc.debits = acc.debits.add(toDecimal(row.amount));
      acc.balance = acc.credits.sub(acc.debits);
      return acc;
    },
    {
      credits: new Prisma.Decimal(0),
      debits: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(0),
    }
  );
}

export async function getOrCreateDepositForRental(tx: Tx, rentalId: string) {
  const existing = await tx.deposit.findUnique({
    where: { rentalId },
    select: { ...depositSelect, amountRequired: true },
  });
  if (existing) return existing;

  const rental = await tx.rental.findUnique({
    where: { id: rentalId },
    select: {
      id: true,
      rentalType: true,
      clientId: true,
      riderId: true,
      currency: true,
      startDate: true,
      securityDepositRequired: true,
    },
  });

  if (!rental) {
    throw new AppError("Rental not found", 404, ErrorCode.NOT_FOUND);
  }

  const amountRequired = toDecimal(rental.securityDepositRequired);

  if (amountRequired.lte(0)) {
    throw new AppError(
      "Security deposit is not required for this rental",
      409,
      ErrorCode.CONFLICT
    );
  }

  const isRiderPayer = rental.rentalType === "B2C";

  return tx.deposit.upsert({
    where: { rentalId },
    create: {
      payerType: isRiderPayer ? "RIDER" : "CLIENT",
      clientId: isRiderPayer ? null : rental.clientId,
      riderId: isRiderPayer ? rental.riderId : null,
      rentalId: rental.id,
      amountRequired,
      currency: rental.currency,
      status: "REQUIRED",
      dueDate: rental.startDate,
    },
    update: {},
    select: { ...depositSelect, amountRequired: true },
  });
}

export async function getDepositBalance(tx: Tx, depositId: string) {
  const totals = await depositTotals(tx, depositId);
  return totals;
}

export async function getDepositBalanceByRental(tx: Tx, rentalId: string) {
  const deposit = await tx.deposit.findUnique({
    where: { rentalId },
    select: { id: true },
  });
  if (!deposit) {
    return {
      credits: new Prisma.Decimal(0),
      debits: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(0),
    };
  }
  return depositTotals(tx, deposit.id);
}

export async function recordDepositTransaction(
  tx: Tx,
  input: {
    rentalId: string;
    type: "RECEIPT" | "REFUND" | "ADJUSTMENT";
    direction: "CREDIT" | "DEBIT";
    amount: Prisma.Decimal;
    reference?: string | null;
    reason?: string | null;
    occurredAt?: Date;
    idempotencyKey?: string;
    actor: AuditActor;
  }
) {
  const deposit = await getOrCreateDepositForRental(tx, input.rentalId);

  const idempotencyKey =
    input.idempotencyKey ??
    (input.reference
      ? `deposit-${input.type}:${deposit.id}:${input.reference}`
      : `deposit-${input.type}:${deposit.id}:${uuidv4()}`);

  const duplicate = await tx.depositTransaction.findUnique({
    where: { idempotencyKey },
  });
  if (duplicate) {
    const totals = await depositTotals(tx, deposit.id);
    return {
      deposit,
      transaction: duplicate,
      balance: totals.balance,
      credits: totals.credits,
      debits: totals.debits,
      duplicate: true,
    };
  }

  const lock = await tx.deposit.updateMany({
    where: { id: deposit.id, version: deposit.version },
    data: { version: { increment: 1 } },
  });

  if (lock.count === 0) {
    throw new AppError(
      "Security deposit was modified concurrently; please retry",
      409,
      ErrorCode.CONFLICT
    );
  }

  const before = await depositTotals(tx, deposit.id);

  if (input.direction === "DEBIT" && before.balance.lt(input.amount)) {
    throw new AppError(
      "Security deposit balance is insufficient for this transaction",
      409,
      ErrorCode.CONFLICT
    );
  }

  const transaction = await tx.depositTransaction.create({
    data: {
      depositId: deposit.id,
      type: input.type,
      direction: input.direction,
      amount: input.amount,
      currency: deposit.currency,
      reference: input.reference ?? null,
      reason: input.reason ?? null,
      authorizedById: input.actor.userId,
      idempotencyKey,
      ...(input.occurredAt ? { createdAt: input.occurredAt } : {}),
    },
  });

  const afterTotals =
    input.direction === "CREDIT"
      ? {
          credits: before.credits.add(input.amount),
          debits: before.debits,
          balance: before.balance.add(input.amount),
        }
      : {
          credits: before.credits,
          debits: before.debits.add(input.amount),
          balance: before.balance.sub(input.amount),
        };

  const status = deriveDepositStatus({
    required: toDecimal(deposit.amountRequired),
    ...afterTotals,
  });

  const updatedDeposit = await tx.deposit.update({
    where: { id: deposit.id },
    data: { status },
    select: depositSelect,
  });

  await logAudit({
    ...input.actor,
    action:
      input.type === "RECEIPT"
        ? "DEPOSIT_RECEIPT"
        : input.type === "REFUND"
          ? "DEPOSIT_REFUND"
          : "DEPOSIT_ADJUSTMENT",
    resource: "Deposit",
    resourceId: deposit.id,
    newData: {
      rentalId: input.rentalId,
      type: input.type,
      direction: input.direction,
      amount: input.amount,
      reference: input.reference ?? null,
      reason: input.reason ?? null,
      balanceAfter: afterTotals.balance,
    },
    summary: `${input.actor.userName} recorded ${input.type.toLowerCase()} of ${input.amount} on security deposit ${deposit.id}.`,
    db: tx,
    throwOnError: true,
  });

  return {
    deposit: updatedDeposit,
    transaction,
    balance: afterTotals.balance,
    credits: afterTotals.credits,
    debits: afterTotals.debits,
    duplicate: false,
  };
}

export async function receiveDeposit(
  rentalId: string,
  input: ReceiveDepositInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) =>
      recordDepositTransaction(tx, {
        rentalId,
        type: "RECEIPT",
        direction: "CREDIT",
        amount: new Prisma.Decimal(input.amount),
        reference: input.reference ?? null,
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey,
        actor,
      })
    );
  } catch (err) {
    rethrowPrismaError(err, "This deposit transaction already exists");
  }
}

export async function refundDeposit(
  rentalId: string,
  input: RefundDepositInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) =>
      recordDepositTransaction(tx, {
        rentalId,
        type: "REFUND",
        direction: "DEBIT",
        amount: new Prisma.Decimal(input.amount),
        reference: input.reference ?? null,
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey,
        actor,
      })
    );
  } catch (err) {
    rethrowPrismaError(err, "This deposit transaction already exists");
  }
}

export async function adjustDeposit(
  rentalId: string,
  input: AdjustDepositInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) =>
      recordDepositTransaction(tx, {
        rentalId,
        type: "ADJUSTMENT",
        direction: input.direction,
        amount: new Prisma.Decimal(input.amount),
        reference: input.reference ?? null,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        actor,
      })
    );
  } catch (err) {
    rethrowPrismaError(err, "This deposit transaction already exists");
  }
}

export async function getRentalDeposit(rentalId: string) {
  const deposit = await prisma.deposit.findUnique({
    where: { rentalId },
    select: depositSelect,
  });

  if (!deposit) {
    throw new AppError(
      "Security deposit not found for this rental",
      404,
      ErrorCode.NOT_FOUND
    );
  }

  const totals = await prisma.$transaction(async (tx) =>
    depositTotals(tx, deposit.id)
  );

  return {
    deposit,
    balance: totals.balance,
    totalCredits: totals.credits,
    totalDebits: totals.debits,
  };
}

export async function getRentalDepositLedger(
  rentalId: string,
  query: DepositLedgerQuery
) {
  const deposit = await prisma.deposit.findUnique({
    where: { rentalId },
    select: { id: true, currency: true },
  });

  if (!deposit) {
    throw new AppError(
      "Security deposit not found for this rental",
      404,
      ErrorCode.NOT_FOUND
    );
  }

  const { page, limit } = query;
  const where: Prisma.DepositTransactionWhereInput = {
    depositId: deposit.id,
  };

  const [transactions, total, totals] = await Promise.all([
    prisma.depositTransaction.findMany({
      where,
      include: { authorizedBy: { select: depositTransactionUserSelect } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.depositTransaction.count({ where }),
    depositTotals(prisma as unknown as Tx, deposit.id),
  ]);

  return {
    depositId: deposit.id,
    currency: deposit.currency,
    balance: totals.balance,
    totalCredits: totals.credits,
    totalDebits: totals.debits,
    transactions,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
