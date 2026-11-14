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
  CreatePayoutInput,
  ListPayoutsQuery,
} from "../validation/payout.js";

export const payoutSelect = {
  id: true,
  recipientType: true,
  riderId: true,
  staffId: true,
  vendorId: true,
  clientId: true,
  payStatementId: true,
  amount: true,
  currency: true,
  status: true,
  approvedById: true,
  approvedAt: true,
  paidAt: true,
  paymentMethod: true,
  referenceNumber: true,
  idempotencyKey: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const payoutDetailSelect = {
  ...payoutSelect,
  rider: { select: { id: true, riderCode: true, fullName: true } },
  payStatement: {
    select: {
      id: true,
      statementNumber: true,
      status: true,
      periodStart: true,
      periodEnd: true,
    },
  },
  approvedBy: { select: { id: true, name: true } },
} as const;

export async function createPayout(
  input: CreatePayoutInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const payStatement = await tx.riderPayStatement.findUnique({
        where: { id: input.payStatementId },
        select: {
          id: true,
          statementNumber: true,
          riderId: true,
          status: true,
          currency: true,
          netPayable: true,
          paidAt: true,
        },
      });

      if (!payStatement) {
        throw new AppError("Pay statement not found", 404, ErrorCode.NOT_FOUND);
      }

      if (payStatement.status === "PAID") {
        const paidPayout = await tx.payout.findFirst({
          where: { payStatementId: payStatement.id, status: "PAID" },
          select: payoutDetailSelect,
        });
        if (paidPayout) {
          return { payout: paidPayout, payStatement, duplicate: true };
        }
        throw new AppError(
          "Pay statement is already marked as paid",
          409,
          ErrorCode.CONFLICT
        );
      }

      if (payStatement.status !== "APPROVED") {
        throw new AppError(
          `Only an APPROVED payStatement can be paid (current status: ${payStatement.status})`,
          409,
          ErrorCode.CONFLICT
        );
      }

      const amount = toDecimal(payStatement.netPayable);
      if (amount.lte(0)) {
        throw new AppError(
          "Pay statement has no payable amount",
          409,
          ErrorCode.CONFLICT
        );
      }

      const idempotencyKey =
        input.idempotencyKey ??
        (input.referenceNumber
          ? `payout:${payStatement.id}:${input.referenceNumber}`
          : `payout:${payStatement.id}:${uuidv4()}`);

      const existing = await tx.payout.findUnique({
        where: { idempotencyKey },
        select: payoutDetailSelect,
      });
      if (existing) {
        return { payout: existing, payStatement, duplicate: true };
      }

      const paidAt = input.paidAt ?? new Date();

      const payout = await tx.payout.create({
        data: {
          recipientType: "RIDER",
          riderId: payStatement.riderId,
          payStatementId: payStatement.id,
          amount,
          currency: payStatement.currency,
          status: "PAID",
          approvedById: actor.userId,
          approvedAt: paidAt,
          paidAt,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          idempotencyKey,
          notes: input.notes ?? null,
        },
        select: payoutDetailSelect,
      });

      await tx.ledgerEntry.create({
        data: {
          riderId: payStatement.riderId,
          entryType: "PAYOUT",
          direction: "DEBIT",
          amount,
          currency: payStatement.currency,
          occurredAt: paidAt,
          description: `Payout for pay statement ${payStatement.statementNumber}`,
          sourceType: "Payout",
          sourceId: payout.id,
          payStatementId: payStatement.id,
          createdById: actor.userId,
          idempotencyKey: `payout:${payout.id}`,
        },
      });

      const updatedStatement = await tx.riderPayStatement.update({
        where: { id: payStatement.id },
        data: {
          status: "PAID",
          paidAt,
          version: { increment: 1 },
        },
        select: {
          id: true,
          statementNumber: true,
          status: true,
          netPayable: true,
          paidAt: true,
        },
      });

      await logAudit({
        ...actor,
        action: "PAY",
        resource: "Payout",
        resourceId: payout.id,
        newData: {
          payStatementId: payStatement.id,
          statementNumber: payStatement.statementNumber,
          riderId: payStatement.riderId,
          amount,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          paidAt,
        },
        summary: `${actor.userName} paid ${amount} for pay statement ${payStatement.statementNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return { payout, payStatement: updatedStatement, duplicate: false };
    });
  } catch (err) {
    rethrowPrismaError(err, "A payout with this reference already exists");
  }
}

export async function listPayouts(query: ListPayoutsQuery) {
  const { page, limit } = query;
  const where: Prisma.PayoutWhereInput = {};

  if (query.payStatementId) where.payStatementId = query.payStatementId;
  if (query.riderId) where.riderId = query.riderId;
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    where.paidAt = {};
    if (query.from) where.paidAt.gte = query.from;
    if (query.to) where.paidAt.lte = query.to;
  }

  const orderBy: Prisma.PayoutOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [payouts, total] = await Promise.all([
    prisma.payout.findMany({
      where,
      select: payoutDetailSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payout.count({ where }),
  ]);

  return {
    payouts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getPayoutById(id: string) {
  const payout = await prisma.payout.findUnique({
    where: { id },
    select: payoutDetailSelect,
  });

  if (!payout) {
    throw new AppError("Payout not found", 404, ErrorCode.NOT_FOUND);
  }

  return payout;
}
