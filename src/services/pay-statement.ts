import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import { AppError } from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import {
  deriveDueStatus,
  periodStartFor,
  toDecimal,
} from "./rental-schedule.js";
import { assertB2CRider, recordLedgerEntry } from "./ledger.js";
import {
  getDepositBalanceByRental,
  recordDepositLedgerEntry,
} from "./depositLedger.js";
import type {
  GeneratePayStatementInput,
  ListPayStatementsQuery,
  PayStatementPaymentInput,
} from "../validation/payStatement.js";

type Tx = Prisma.TransactionClient;

const OPEN_DUE_STATUSES = ["PENDING", "PARTIALLY_PAID", "OVERDUE"] as const;
const COLLECTIBLE_RENTAL_STATUSES = ["ACTIVE"] as const;

export const payStatementLineSelect = {
  id: true,
  payStatementId: true,
  lineType: true,
  direction: true,
  amount: true,
  description: true,
  rentalId: true,
  ledgerEntryId: true,
  referenceType: true,
  referenceId: true,
  snapshot: true,
  createdAt: true,
} as const;

export const payStatementSelect = {
  id: true,
  statementNumber: true,
  riderId: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  grossCredits: true,
  totalDeductions: true,
  netPayable: true,
  shortfallAmount: true,
  requiresManualReview: true,
  calculationSnapshot: true,
  paidById: true,
  paidAt: true,
  paymentMethod: true,
  referenceNumber: true,
  failureReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const payStatementDetailSelect = {
  ...payStatementSelect,
  rider: { select: { id: true, riderCode: true, fullName: true } },
  paidBy: { select: { id: true, name: true } },
  lines: {
    select: payStatementLineSelect,
    orderBy: { createdAt: "asc" },
  },
} as const;

function generatePayStatementNumber() {
  return `PS-${uuidv4().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

type PayStatementLineTypeValue =
  | "DELIVERY_PAY"
  | "RENT_DEDUCTION"
  | "DEPOSIT_DEDUCTION"
  | "OTHER_DEDUCTION"
  | "INCENTIVE"
  | "REIMBURSEMENT"
  | "ADVANCE"
  | "ADVANCE_RECOVERY";

function payStatementLineTypeForEntry(
  entryType: string,
  direction: string
): PayStatementLineTypeValue {
  switch (entryType) {
    case "DELIVERY_PAY":
      return "DELIVERY_PAY";
    case "RENT_DEDUCTION":
      return "RENT_DEDUCTION";
    case "DEPOSIT_DEDUCTION":
      return "DEPOSIT_DEDUCTION";
    case "INCENTIVE":
      return "INCENTIVE";
    case "REIMBURSEMENT":
      return "REIMBURSEMENT";
    case "ADVANCE":
      return "ADVANCE";
    case "ADVANCE_RECOVERY":
      return "ADVANCE_RECOVERY";
    default:
      if (direction === "CREDIT") {
        throw new AppError(
          `Unsupported credit ledger entry type for a pay statement: ${entryType}`,
          409
        );
      }
      return "OTHER_DEDUCTION";
  }
}

export async function generatePayStatement(
  input: GeneratePayStatementInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rider = await assertB2CRider(tx, input.riderId);
      await tx.$queryRaw`SELECT id FROM riders WHERE id = ${rider.id} FOR UPDATE`;
      const periodStart = input.periodStart;
      const periodEnd = periodStartFor(periodStart, input.cycle, 1);

      const existing = await tx.riderPayStatement.findFirst({
        where: {
          riderId: rider.id,
          status: { notIn: ["REVERSED", "FAILED"] },
          periodStart: { lt: periodEnd },
          periodEnd: { gt: periodStart },
        },
        select: payStatementDetailSelect,
      });

      if (existing) {
        return { payStatement: existing, duplicate: true };
      }
      //debts this rider already carries that the new slip must absorb before paying out.
      // shortcut: advances are not implemented, so no rider debit can be
      // unclaimed. Restore this query, the debit lines, and the stamp below
      // when ADVANCE ships.
      // const unsettledDebits = await tx.ledgerEntry.findMany({
      //   where: {
      //     riderId: rider.id,
      //     payStatementId: null,
      //     direction: "DEBIT",
      //     occurredAt: { gte: periodStart, lt: periodEnd },
      //   },
      //   orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      //   select: {
      //     id: true,
      //     entryType: true,
      //     amount: true,
      //     description: true,
      //     rentalId: true,
      //     occurredAt: true,
      //   },
      // });

      // Earnings are AML's own number for an AML-managed rider, taken from the
      // client portal. They are not ledger entries; the ledger only tracks rent.
      const grossCredits = new Prisma.Decimal(input.grossCredits);
      const existingDeductionTotal = new Prisma.Decimal(0);
      const now = new Date();

      const payStatement = await tx.riderPayStatement.create({
        data: {
          statementNumber: generatePayStatementNumber(),
          riderId: rider.id,
          periodStart,
          periodEnd,
          status: "DRAFT",
          grossCredits,
          totalDeductions: new Prisma.Decimal(0),
          netPayable: new Prisma.Decimal(0),
          shortfallAmount: new Prisma.Decimal(0),
          requiresManualReview: false,
          calculationSnapshot: {
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            grossCreditsSource: "PORTAL",
            earningsReference: input.earningsReference ?? null,
            notes: input.notes ?? null,
          } as Prisma.InputJsonValue,
        },
        select: { id: true, statementNumber: true },
      });

      await tx.riderPayStatementLine.create({
        data: {
          payStatementId: payStatement.id,
          lineType: "DELIVERY_PAY",
          direction: "CREDIT",
          amount: grossCredits,
          description: input.earningsReference
            ? `Earnings from AML portal (${input.earningsReference})`
            : "Earnings from AML portal",
          referenceType: "Portal",
          referenceId: input.earningsReference ?? null,
        },
      });

      // for (const debit of unsettledDebits) {
      //   await tx.riderPayStatementLine.create({
      //     data: {
      //       payStatementId: payStatement.id,
      //       lineType: payStatementLineTypeForEntry(debit.entryType, "DEBIT"),
      //       direction: "DEBIT",
      //       amount: debit.amount,
      //       description: debit.description,
      //       rentalId: debit.rentalId,
      //       ledgerEntryId: debit.id,
      //       referenceType: "LedgerEntry",
      //       referenceId: debit.id,
      //       snapshot: {
      //         occurredAt: debit.occurredAt.toISOString(),
      //       } as Prisma.InputJsonValue,
      //     },
      //   });
      // }

      // await tx.ledgerEntry.updateMany({
      //   where: {
      //     id: {
      //       in: unsettledDebits.map((entry) => entry.id),
      //     },
      //   },
      //   data: { payStatementId: payStatement.id },
      // });

      const dues = await tx.rentalDue.findMany({
        where: {
          status: { in: [...OPEN_DUE_STATUSES] },
          outstandingAmount: { gt: 0 },
          rental: {
            riderId: rider.id,
            rentalType: "B2C",
            status: { in: [...COLLECTIBLE_RENTAL_STATUSES] },
          },
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          rentalId: true,
          amountCollected: true,
          outstandingAmount: true,
          dueDate: true,
          periodStart: true,
          periodEnd: true,
          rental: {
            select: { rentalNumber: true },
          },
        },
      });

      let rentDeduction = new Prisma.Decimal(0);
      let remaining = grossCredits.sub(existingDeductionTotal); //currently always =grosscredits
      if (remaining.lt(0)) remaining = new Prisma.Decimal(0);
      const rentAllocations: Array<{
        dueId: string;
        rentalId: string;
        amount: string;
      }> = [];

      for (const due of dues) {
        if (remaining.lte(0)) break;

        const outstanding = toDecimal(due.outstandingAmount);
        const applied = Prisma.Decimal.min(outstanding, remaining);
        if (applied.lte(0)) continue;

        const nextOutstanding = outstanding.sub(applied);
        const nextCollected = toDecimal(due.amountCollected).add(applied);

        const updated = await tx.rentalDue.updateMany({
          where: { id: due.id, outstandingAmount: { gte: applied } },
          data: {
            amountCollected: { increment: applied },
            outstandingAmount: { decrement: applied },
            status: deriveDueStatus({
              amountCollected: nextCollected,
              outstandingAmount: nextOutstanding,
              dueDate: due.dueDate,
            }),
          },
        });

        if (updated.count === 0) {
          throw new AppError(
            "Collection due was modified concurrently; please retry",
            409
          );
        }

        const collection = await tx.collection.create({
          data: {
            payerType: "RIDER",
            riderId: rider.id,
            rentalDueId: due.id,
            amount: applied,
            paymentMethod: "OTHER",
            referenceNumber: null,
            receivedAt: now,
            receivedById: actor.userId,
            notes: `Rent deducted from pay statement ${payStatement.statementNumber}`,
          },
          select: { id: true },
        });

        await recordLedgerEntry(
          tx,
          {
            rentalId: due.rentalId,
            entryType: "COLLECTION_RECEIVED",
            direction: "CREDIT",
            amount: applied,
            occurredAt: now,
            description: `Rent deducted from pay statement ${payStatement.statementNumber}`,
            sourceType: "Collection",
            sourceId: collection.id,
          },
          actor.userId
        );

        const deduction = await recordLedgerEntry(
          tx,
          {
            riderId: rider.id,
            entryType: "RENT_DEDUCTION",
            direction: "DEBIT",
            amount: applied,
            occurredAt: now,
            description: `Rent deducted for rental ${due.rental.rentalNumber}`,
            sourceType: "RiderPayStatement",
            sourceId: payStatement.id,
            payStatementId: payStatement.id,
            rentalId: due.rentalId,
          },
          actor.userId
        );

        await tx.riderPayStatementLine.create({
          data: {
            payStatementId: payStatement.id,
            lineType: "RENT_DEDUCTION",
            direction: "DEBIT",
            amount: applied,
            description: `Rent deducted for rental ${due.rental.rentalNumber}`,
            rentalId: due.rentalId,
            ledgerEntryId: deduction.id,
            referenceType: "RentalDue",
            referenceId: due.id,
            snapshot: {
              dueId: due.id,
              periodStart: due.periodStart.toISOString(),
              periodEnd: due.periodEnd.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });

        rentDeduction = rentDeduction.add(applied);
        remaining = remaining.sub(applied);
        rentAllocations.push({
          dueId: due.id,
          rentalId: due.rentalId,
          amount: applied.toString(),
        });
      }

      let manualDeductionTotal = new Prisma.Decimal(0);

      for (const deduction of input.manualDeductions ?? []) {
        const amount = new Prisma.Decimal(deduction.amount);
        const entry = await recordLedgerEntry(
          tx,
          {
            riderId: rider.id,
            entryType:
              deduction.lineType === "OTHER_DEDUCTION"
                ? "OTHER"
                : deduction.lineType,
            direction: "DEBIT",
            amount,
            occurredAt: now,
            description: deduction.description,
            sourceType: "RiderPayStatement",
            sourceId: payStatement.id,
            payStatementId: payStatement.id,
            rentalId: deduction.rentalId ?? null,
          },
          actor.userId
        );

        let referenceType = "ManualDeduction";
        let referenceId = input.notes ?? null;

        if (deduction.lineType === "DEPOSIT_DEDUCTION") {
          const deposit = await tx.deposit.findUnique({
            where: { id: deduction.depositId! },
            select: {
              id: true,
              rentalId: true,
              riderId: true,
              amountRequired: true,
            },
          });

          if (!deposit || !deposit.rentalId) {
            throw new AppError("Security deposit not found", 404);
          }
          if (deposit.riderId !== rider.id) {
            throw new AppError(
              "Security deposit does not belong to this rider",
              409
            );
          }

          const balance = await getDepositBalanceByRental(
            tx,
            deposit.rentalId
          );
          if (
            balance.balance
              .add(amount)
              .gt(toDecimal(deposit.amountRequired))
          ) {
            throw new AppError(
              "Deposit deduction exceeds the required security deposit",
              409
            );
          }

          await recordDepositLedgerEntry(tx, {
            rentalId: deposit.rentalId,
            type: "RECEIPT",
            direction: "CREDIT",
            amount,
            reference: payStatement.statementNumber,
            reason: `Deducted from pay statement ${payStatement.statementNumber}`,
            occurredAt: now,
            payStatementId: payStatement.id,
            actor,
          });

          referenceType = "Deposit";
          referenceId = deposit.id;
        }

        await tx.riderPayStatementLine.create({
          data: {
            payStatementId: payStatement.id,
            lineType: deduction.lineType,
            direction: "DEBIT",
            amount,
            description: deduction.description,
            rentalId: deduction.rentalId ?? null,
            ledgerEntryId: entry.id,
            referenceType,
            referenceId,
          },
        });

        manualDeductionTotal = manualDeductionTotal.add(amount);
      }

      const totalDeductions = existingDeductionTotal
        .add(rentDeduction)
        .add(manualDeductionTotal);
      const net = grossCredits.sub(totalDeductions);

      if (net.lt(0)) {
        throw new AppError(
          "Pay statement deductions exceed gross credits; reduce manual deductions",
          409
        );
      }

      const netPayable = net;
      const zeroNetStatement = net.eq(0);
      const status = zeroNetStatement ? "PAID" : "PAYABLE";

      const updatedStatement = await tx.riderPayStatement.update({
        where: { id: payStatement.id },
        data: {
          status,
          grossCredits,
          totalDeductions,
          netPayable,
          shortfallAmount: new Prisma.Decimal(0),
          requiresManualReview: false,
          paidAt: zeroNetStatement ? now : undefined,
          calculationSnapshot: {
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            grossCredits: grossCredits.toString(),
            existingDebitDeduction: existingDeductionTotal.toString(),
            rentDeduction: rentDeduction.toString(),
            manualDeductionTotal: manualDeductionTotal.toString(),
            zeroNetStatement,
            rentAllocations,
            notes: input.notes ?? null,
          } as Prisma.InputJsonValue,
        },
        select: payStatementDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "GENERATE",
        resource: "RiderPayStatement",
        resourceId: updatedStatement.id,
        newData: {
          statementNumber: updatedStatement.statementNumber,
          riderId: rider.id,
          riderCode: rider.riderCode,
          periodStart,
          periodEnd,
          grossCredits,
          totalDeductions,
          netPayable,
          status,
        },
        summary: `${actor.userName} generated payStatement ${updatedStatement.statementNumber} for rider ${rider.riderCode} with net payable ${netPayable}.`,
        db: tx,
        throwOnError: true,
      });

      return { payStatement: updatedStatement, duplicate: false };
    });
  } catch (err) {
    throw AppError.fromPrisma(
      err,
      "A pay statement already exists for this rider and period"
    ) ?? err;
  }
}

export async function payPayStatement(
  id: string,
  input: PayStatementPaymentInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const payStatement = await tx.riderPayStatement.findUnique({
        where: { id },
        select: {
          id: true,
          statementNumber: true,
          riderId: true,
          status: true,
          netPayable: true,
          paidAt: true,
        },
      });

      if (!payStatement) {
        throw new AppError("Pay statement not found", 404);
      }

      if (payStatement.status === "PAID") {
        const existing = await tx.riderPayStatement.findUniqueOrThrow({
          where: { id },
          select: payStatementDetailSelect,
        });
        return { payStatement: existing, duplicate: true };
      }

      if (payStatement.status !== "PAYABLE") {
        throw new AppError(
          `Only a PAYABLE payStatement can be paid (current status: ${payStatement.status})`,
          409
        );
      }

      const amount = toDecimal(payStatement.netPayable);
      if (amount.lte(0)) {
        throw new AppError(
          "Pay statement has no payable amount",
          409
        );
      }

      const paidAt = input.paidAt ?? new Date();

      await recordLedgerEntry(
        tx,
        {
          riderId: payStatement.riderId,
          entryType: "PAYOUT",
          direction: "DEBIT",
          amount,
          occurredAt: paidAt,
          description: `Payout for pay statement ${payStatement.statementNumber}`,
          sourceType: "RiderPayStatement",
          sourceId: payStatement.id,
          payStatementId: payStatement.id,
        },
        actor.userId
      );

      const updated = await tx.riderPayStatement.update({
        where: { id },
        data: {
          status: "PAID",
          paidById: actor.userId,
          paidAt,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
        },
        select: payStatementDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "PAY",
        resource: "RiderPayStatement",
        resourceId: payStatement.id,
        oldData: { status: payStatement.status },
        newData: {
          status: "PAID",
          statementNumber: payStatement.statementNumber,
          riderId: payStatement.riderId,
          amount,
          paymentMethod: input.paymentMethod,
          referenceNumber: input.referenceNumber ?? null,
          paidAt,
        },
        summary: `${actor.userName} paid ${amount} for payStatement ${payStatement.statementNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return { payStatement: updated, duplicate: false };
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Pay statement could not be paid") ?? err;
  }
}

export async function listPayStatements(query: ListPayStatementsQuery) {
  const { page, limit, search } = query;
  const where: Prisma.RiderPayStatementWhereInput = {};

  if (query.riderId) where.riderId = query.riderId;
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    where.periodStart = {};
    if (query.from) where.periodStart.gte = query.from;
    if (query.to) where.periodStart.lte = query.to;
  }
  if (search) {
    where.OR = [
      { statementNumber: { contains: search, mode: "insensitive" } },
      { rider: { fullName: { contains: search, mode: "insensitive" } } },
      { rider: { riderCode: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.RiderPayStatementOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [payStatements, total] = await Promise.all([
    prisma.riderPayStatement.findMany({
      where,
      select: payStatementSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.riderPayStatement.count({ where }),
  ]);

  return {
    payStatements,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getPayStatementById(id: string) {
  const payStatement = await prisma.riderPayStatement.findUnique({
    where: { id },
    select: payStatementDetailSelect,
  });

  if (!payStatement) {
    throw new AppError("Pay statement not found", 404);
  }

  return payStatement;
}
