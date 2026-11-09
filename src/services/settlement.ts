import { v4 as uuidv4 } from "uuid";
import { Prisma } from "../generated/prisma/client.js";
import prisma from "../database/prismaClient.js";
import {
  AppError,
  ErrorCode,
  rethrowPrismaError,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import {
  addDaysUtc,
  deriveDueStatus,
  toDecimal,
} from "./rental-schedule.js";
import type {
  ApproveSettlementInput,
  GenerateSettlementInput,
  ListSettlementsQuery,
} from "../validation/settlement.js";

type Tx = Prisma.TransactionClient;

const OPEN_DUE_STATUSES = ["PENDING", "PARTIALLY_PAID", "OVERDUE"] as const;
const COLLECTIBLE_RENTAL_STATUSES = ["ACTIVE", "ON_HOLD"] as const;

export const settlementLineSelect = {
  id: true,
  settlementId: true,
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

export const settlementSelect = {
  id: true,
  settlementNumber: true,
  riderId: true,
  periodStart: true,
  periodEnd: true,
  status: true,
  currency: true,
  grossEarnings: true,
  totalDeductions: true,
  netPayable: true,
  shortfallAmount: true,
  requiresManualReview: true,
  calculationSnapshot: true,
  version: true,
  approvedById: true,
  approvedAt: true,
  paidAt: true,
  failureReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const settlementDetailSelect = {
  ...settlementSelect,
  rider: { select: { id: true, riderCode: true, fullName: true } },
  approvedBy: { select: { id: true, name: true } },
  lines: {
    select: settlementLineSelect,
    orderBy: { createdAt: "asc" },
  },
  payouts: {
    select: {
      id: true,
      amount: true,
      status: true,
      paymentMethod: true,
      referenceNumber: true,
      paidAt: true,
    },
    orderBy: { createdAt: "asc" },
  },
} as const;

function generateSettlementNumber() {
  return `STL-${uuidv4().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}

function startOfDayUtc(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function resolveSettlementPeriod(input: GenerateSettlementInput) {
  if (input.periodStart && input.periodEnd) {
    return { periodStart: input.periodStart, periodEnd: input.periodEnd };
  }

  const base = startOfDayUtc(input.date ?? new Date());
  const offset = input.cycle === "NEXT_DAY" ? 1 : 0;
  const periodStart = addDaysUtc(base, offset);

  return { periodStart, periodEnd: addDaysUtc(periodStart, 1) };
}

type SettlementLineTypeValue =
  | "DELIVERY_EARNING"
  | "RENT_DEDUCTION"
  | "DEPOSIT_DEDUCTION"
  | "ADJUSTMENT"
  | "OTHER_DEDUCTION";

function settlementLineTypeForEntry(
  entryType: string,
  direction: string
): SettlementLineTypeValue {
  switch (entryType) {
    case "DELIVERY_EARNING":
      return "DELIVERY_EARNING";
    case "RENT_DEDUCTION":
      return "RENT_DEDUCTION";
    case "DEPOSIT_DEDUCTION":
      return "DEPOSIT_DEDUCTION";
    case "ADJUSTMENT":
    case "REVERSAL":
      return "ADJUSTMENT";
    default:
      return direction === "CREDIT" ? "DELIVERY_EARNING" : "OTHER_DEDUCTION";
  }
}

async function assertSettlementRider(tx: Tx, riderId: string) {
  const rider = await tx.rider.findUnique({
    where: { id: riderId },
    select: {
      id: true,
      riderCode: true,
      fullName: true,
      status: true,
      rentalType: true,
      deletedAt: true,
    },
  });

  if (!rider || rider.deletedAt) {
    throw new AppError("Rider not found", 404, ErrorCode.NOT_FOUND);
  }
  if (rider.rentalType && rider.rentalType !== "B2C") {
    throw new AppError(
      "Settlements can only be generated for a B2C rider",
      409,
      ErrorCode.CONFLICT
    );
  }

  return rider;
}

export async function generateSettlement(
  input: GenerateSettlementInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const rider = await assertSettlementRider(tx, input.riderId);
      const { periodStart, periodEnd } = resolveSettlementPeriod(input);

      const existing = await tx.riderSettlement.findFirst({
        where: {
          riderId: rider.id,
          periodStart,
          periodEnd,
          status: { notIn: ["REVERSED", "FAILED"] },
        },
        select: settlementDetailSelect,
      });

      if (existing) {
        return { settlement: existing, duplicate: true };
      }

      const earnings = await tx.earningsLedger.findMany({
        where: {
          riderId: rider.id,
          settlementId: null,
          direction: "CREDIT",
          occurredAt: { gte: periodStart, lt: periodEnd },
        },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          entryType: true,
          amount: true,
          currency: true,
          description: true,
          rentalId: true,
          occurredAt: true,
        },
      });

      if (earnings.length === 0) {
        throw new AppError(
          "No unsettled earnings were found for the settlement period",
          409,
          ErrorCode.CONFLICT
        );
      }

      const unsettledDebits = await tx.earningsLedger.findMany({
        where: {
          riderId: rider.id,
          settlementId: null,
          direction: "DEBIT",
        },
        orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          entryType: true,
          amount: true,
          currency: true,
          description: true,
          rentalId: true,
          occurredAt: true,
        },
      });

      const grossEarnings = earnings.reduce(
        (total, earning) => total.add(toDecimal(earning.amount)),
        new Prisma.Decimal(0)
      );
      const existingDeductionTotal = unsettledDebits.reduce(
        (total, entry) => total.add(toDecimal(entry.amount)),
        new Prisma.Decimal(0)
      );
      const currency = earnings[0]?.currency ?? "INR";
      const now = new Date();

      const settlement = await tx.riderSettlement.create({
        data: {
          settlementNumber: generateSettlementNumber(),
          riderId: rider.id,
          periodStart,
          periodEnd,
          status: "DRAFT",
          currency,
          grossEarnings,
          totalDeductions: new Prisma.Decimal(0),
          netPayable: new Prisma.Decimal(0),
          shortfallAmount: new Prisma.Decimal(0),
          requiresManualReview: false,
          calculationSnapshot: {
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            earningsCount: earnings.length,
            notes: input.notes ?? null,
          } as Prisma.InputJsonValue,
        },
        select: { id: true, settlementNumber: true },
      });

      for (const earning of earnings) {
        await tx.riderSettlementLine.create({
          data: {
            settlementId: settlement.id,
            lineType: settlementLineTypeForEntry(
              earning.entryType,
              "CREDIT"
            ),
            direction: "CREDIT",
            amount: earning.amount,
            description: earning.description,
            rentalId: earning.rentalId,
            ledgerEntryId: earning.id,
            referenceType: "EarningsLedger",
            referenceId: earning.id,
            snapshot: {
              occurredAt: earning.occurredAt.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }

      for (const debit of unsettledDebits) {
        await tx.riderSettlementLine.create({
          data: {
            settlementId: settlement.id,
            lineType: settlementLineTypeForEntry(debit.entryType, "DEBIT"),
            direction: "DEBIT",
            amount: debit.amount,
            description: debit.description,
            rentalId: debit.rentalId,
            ledgerEntryId: debit.id,
            referenceType: "EarningsLedger",
            referenceId: debit.id,
            snapshot: {
              occurredAt: debit.occurredAt.toISOString(),
            } as Prisma.InputJsonValue,
          },
        });
      }

      await tx.earningsLedger.updateMany({
        where: {
          id: {
            in: [...earnings, ...unsettledDebits].map((entry) => entry.id),
          },
        },
        data: { settlementId: settlement.id },
      });

      const dues = await tx.rentalCollectionDue.findMany({
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
            select: { rentalNumber: true, currency: true },
          },
        },
      });

      let rentDeduction = new Prisma.Decimal(0);
      let remaining = grossEarnings.sub(existingDeductionTotal);
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

        const updated = await tx.rentalCollectionDue.updateMany({
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
            409,
            ErrorCode.CONFLICT
          );
        }

        const collection = await tx.collection.create({
          data: {
            payerType: "RIDER",
            riderId: rider.id,
            rentalId: due.rentalId,
            rentalDueId: due.id,
            amount: applied,
            currency: due.rental.currency,
            paymentMethod: "OTHER",
            referenceNumber: null,
            receivedAt: now,
            status: "CLEARED",
            receivedById: actor.userId,
            reconciledAt: now,
            reconciledById: actor.userId,
            idempotencyKey: `settlement-rent:${settlement.id}:${due.id}`,
            notes: `Rent deducted from settlement ${settlement.settlementNumber}`,
          },
          select: { id: true },
        });

        await tx.rentalLedgerEntry.create({
          data: {
            rentalId: due.rentalId,
            entryType: "COLLECTION_RECEIVED",
            direction: "CREDIT",
            amount: applied,
            currency: due.rental.currency,
            occurredAt: now,
            description: `Rent deducted from settlement ${settlement.settlementNumber}`,
            sourceType: "Collection",
            sourceId: collection.id,
            idempotencyKey: `collection:${collection.id}`,
            createdById: actor.userId,
          },
        });

        const deduction = await tx.earningsLedger.create({
          data: {
            riderId: rider.id,
            entryType: "RENT_DEDUCTION",
            direction: "DEBIT",
            amount: applied,
            currency,
            occurredAt: now,
            description: `Rent deducted for rental ${due.rental.rentalNumber}`,
            sourceType: "RiderSettlement",
            sourceId: settlement.id,
            settlementId: settlement.id,
            rentalId: due.rentalId,
            createdById: actor.userId,
            idempotencyKey: `settlement-rent:${settlement.id}:${due.id}`,
          },
          select: { id: true },
        });

        await tx.riderSettlementLine.create({
          data: {
            settlementId: settlement.id,
            lineType: "RENT_DEDUCTION",
            direction: "DEBIT",
            amount: applied,
            description: `Rent deducted for rental ${due.rental.rentalNumber}`,
            rentalId: due.rentalId,
            ledgerEntryId: deduction.id,
            referenceType: "RentalCollectionDue",
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

      for (const [index, deduction] of (input.manualDeductions ?? []).entries()) {
        const amount = new Prisma.Decimal(deduction.amount);
        const entry = await tx.earningsLedger.create({
          data: {
            riderId: rider.id,
            entryType:
              deduction.lineType === "OTHER_DEDUCTION"
                ? "OTHER"
                : deduction.lineType,
            direction: "DEBIT",
            amount,
            currency,
            occurredAt: now,
            description: deduction.description,
            sourceType: "RiderSettlement",
            sourceId: settlement.id,
            settlementId: settlement.id,
            rentalId: deduction.rentalId ?? null,
            createdById: actor.userId,
            idempotencyKey: `settlement-manual:${settlement.id}:${index}`,
          },
          select: { id: true },
        });

        await tx.riderSettlementLine.create({
          data: {
            settlementId: settlement.id,
            lineType: deduction.lineType,
            direction: "DEBIT",
            amount,
            description: deduction.description,
            rentalId: deduction.rentalId ?? null,
            ledgerEntryId: entry.id,
            referenceType: "ManualDeduction",
            referenceId: input.notes ?? null,
          },
        });

        manualDeductionTotal = manualDeductionTotal.add(amount);
      }

      const totalDeductions = existingDeductionTotal
        .add(rentDeduction)
        .add(manualDeductionTotal);
      const net = grossEarnings.sub(totalDeductions);
      const shortfallAmount = net.lt(0) ? net.abs() : new Prisma.Decimal(0);
      const netPayable = net.gt(0) ? net : new Prisma.Decimal(0);
      const requiresManualReview = shortfallAmount.gt(0);
      const zeroNetSettlement = net.eq(0);
      const status = requiresManualReview
        ? "DRAFT"
        : zeroNetSettlement
          ? "PAID"
          : "PAYABLE";

      const updatedSettlement = await tx.riderSettlement.update({
        where: { id: settlement.id },
        data: {
          status,
          grossEarnings,
          totalDeductions,
          netPayable,
          shortfallAmount,
          requiresManualReview,
          paidAt: zeroNetSettlement ? now : undefined,
          version: { increment: 1 },
          calculationSnapshot: {
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString(),
            earningsCount: earnings.length,
            existingDebitDeduction: existingDeductionTotal.toString(),
            rentDeduction: rentDeduction.toString(),
            manualDeductionTotal: manualDeductionTotal.toString(),
            zeroNetSettlement,
            rentAllocations,
            notes: input.notes ?? null,
          } as Prisma.InputJsonValue,
        },
        select: settlementDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "GENERATE",
        resource: "RiderSettlement",
        resourceId: updatedSettlement.id,
        newData: {
          settlementNumber: updatedSettlement.settlementNumber,
          riderId: rider.id,
          riderCode: rider.riderCode,
          periodStart,
          periodEnd,
          grossEarnings,
          totalDeductions,
          netPayable,
          shortfallAmount,
          status,
        },
        summary: `${actor.userName} generated settlement ${updatedSettlement.settlementNumber} for rider ${rider.riderCode} with net payable ${netPayable}.`,
        db: tx,
        throwOnError: true,
      });

      return { settlement: updatedSettlement, duplicate: false };
    });
  } catch (err) {
    rethrowPrismaError(
      err,
      "A settlement already exists for this rider and period"
    );
  }
}

export async function approveSettlement(
  id: string,
  input: ApproveSettlementInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const settlement = await tx.riderSettlement.findUnique({
        where: { id },
        select: {
          id: true,
          settlementNumber: true,
          riderId: true,
          status: true,
          netPayable: true,
          shortfallAmount: true,
          requiresManualReview: true,
          version: true,
        },
      });

      if (!settlement) {
        throw new AppError("Settlement not found", 404, ErrorCode.NOT_FOUND);
      }

      if (settlement.status === "APPROVED") {
        const existing = await tx.riderSettlement.findUniqueOrThrow({
          where: { id },
          select: settlementDetailSelect,
        });
        return { settlement: existing, duplicate: true };
      }

      if (settlement.status !== "PAYABLE") {
        throw new AppError(
          `Only a PAYABLE settlement can be approved (current status: ${settlement.status})`,
          409,
          ErrorCode.CONFLICT
        );
      }

      if (
        settlement.requiresManualReview ||
        toDecimal(settlement.shortfallAmount).gt(0)
      ) {
        throw new AppError(
          "Settlement requires manual review before it can be approved",
          409,
          ErrorCode.CONFLICT
        );
      }

      if (toDecimal(settlement.netPayable).lte(0)) {
        throw new AppError(
          "Settlement has no payable amount",
          409,
          ErrorCode.CONFLICT
        );
      }

      const approvedAt = new Date();
      const updated = await tx.riderSettlement.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: actor.userId,
          approvedAt,
          version: { increment: 1 },
        },
        select: settlementDetailSelect,
      });

      await logAudit({
        ...actor,
        action: "APPROVE",
        resource: "RiderSettlement",
        resourceId: settlement.id,
        oldData: { status: settlement.status },
        newData: {
          status: "APPROVED",
          settlementNumber: settlement.settlementNumber,
          netPayable: settlement.netPayable,
          notes: input.notes ?? null,
        },
        summary: `${actor.userName} approved settlement ${settlement.settlementNumber}.`,
        db: tx,
        throwOnError: true,
      });

      return { settlement: updated, duplicate: false };
    });
  } catch (err) {
    rethrowPrismaError(err, "Settlement could not be approved");
  }
}

export async function listSettlements(query: ListSettlementsQuery) {
  const { page, limit, search } = query;
  const where: Prisma.RiderSettlementWhereInput = {};

  if (query.riderId) where.riderId = query.riderId;
  if (query.status) where.status = query.status;
  if (query.from || query.to) {
    where.periodStart = {};
    if (query.from) where.periodStart.gte = query.from;
    if (query.to) where.periodStart.lte = query.to;
  }
  if (search) {
    where.OR = [
      { settlementNumber: { contains: search, mode: "insensitive" } },
      { rider: { fullName: { contains: search, mode: "insensitive" } } },
      { rider: { riderCode: { contains: search, mode: "insensitive" } } },
    ];
  }

  const orderBy: Prisma.RiderSettlementOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [settlements, total] = await Promise.all([
    prisma.riderSettlement.findMany({
      where,
      select: settlementSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.riderSettlement.count({ where }),
  ]);

  return {
    settlements,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getSettlementById(id: string) {
  const settlement = await prisma.riderSettlement.findUnique({
    where: { id },
    select: settlementDetailSelect,
  });

  if (!settlement) {
    throw new AppError("Settlement not found", 404, ErrorCode.NOT_FOUND);
  }

  return settlement;
}
