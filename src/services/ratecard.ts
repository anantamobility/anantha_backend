import { v4 as uuidv4 } from "uuid";
import prisma from "../database/prismaClient.js";
import { Prisma } from "../generated/prisma/client.js";
import {
  AppError,
  ErrorCode,
} from "../utils/errors.js";
import { logAudit, type AuditActor } from "../utils/log.js";
import type {
  ChangeRateCardStatusInput,
  CreateRateCardInput,
  ListRateCardsQuery,
  UpdateRateCardInput,
} from "../validation/ratecard.js";

export const rateCardListSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  vehicleCategory: true,
  rentalType: true,
  dailyRate: true,
  weeklyRate: true,
  fortnightlyRate: true,
  monthlyRate: true,
  securityDeposit: true,
  effectiveFrom: true,
  effectiveTo: true,
  isActive: true,
  terms: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const rateCardDetailSelect = {
  ...rateCardListSelect,
} as const;

function generateRateCardCode() {
  return `RC-${uuidv4().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

function termsInput(
  value: CreateRateCardInput["terms"]
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
}

function assertDateRange(effectiveFrom: Date, effectiveTo: Date | null) {
  if (effectiveTo && effectiveTo.getTime() <= effectiveFrom.getTime()) {
    throw new AppError(
      "effectiveTo must be later than effectiveFrom",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }
}

export async function createRateCard(
  input: CreateRateCardInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const effectiveTo = input.effectiveTo ?? null;
      assertDateRange(input.effectiveFrom, effectiveTo);

      const data: Prisma.RateCardUncheckedCreateInput = {
        code: input.code ?? generateRateCardCode(),
        name: input.name,
        description: input.description ?? null,
        vehicleCategory: input.vehicleCategory ?? null,
        rentalType: input.rentalType ?? null,
        dailyRate: input.dailyRate,
        weeklyRate: input.weeklyRate ?? null,
        fortnightlyRate: input.fortnightlyRate ?? null,
        monthlyRate: input.monthlyRate ?? null,
        securityDeposit: input.securityDeposit ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo,
        isActive: input.isActive ?? true,
      };

      const terms = termsInput(input.terms);
      if (terms !== undefined) data.terms = terms;

      const rateCard = await tx.rateCard.create({
        data,
        select: rateCardDetailSelect,
      });
      const { terms: _terms, ...rateCardAudit } = rateCard;

      await logAudit({
        ...actor,
        action: "CREATE",
        resource: "RateCard",
        resourceId: rateCard.id,
        newData: rateCardAudit,
        summary: `${actor.userName} created ratecard ${rateCard.code}.`,
        db: tx,
        throwOnError: true,
      });

      return rateCard;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "A ratecard with this code already exists") ?? err;
  }
}

function listRateCardsWhere(query: ListRateCardsQuery) {
  const {
    search,
    vehicleCategory,
    rentalType,
    isActive,
    validOn,
  } = query;

  const where: Prisma.RateCardWhereInput = { deletedAt: null };
  if (vehicleCategory) where.vehicleCategory = vehicleCategory;
  if (rentalType) where.rentalType = rentalType;
  if (typeof isActive === "boolean") where.isActive = isActive;

  if (validOn) {
    where.effectiveFrom = { lte: validOn };
    where.AND = [
      {
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: validOn } }],
      },
    ];
  }

  if (search) {
    where.OR = [
      { code: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { vehicleCategory: { contains: search, mode: "insensitive" } },
    ];
  }

  return where;
}

export async function listRateCards(query: ListRateCardsQuery) {
  const { page, limit } = query;
  const where = listRateCardsWhere(query);

  const orderBy: Prisma.RateCardOrderByWithRelationInput = {
    [query.sortBy]: query.sortOrder,
  };

  const [rateCards, total] = await Promise.all([
    prisma.rateCard.findMany({
      where,
      select: rateCardListSelect,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.rateCard.count({ where }),
  ]);

  return {
    rateCards,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getRateCardById(id: string) {
  const rateCard = await prisma.rateCard.findUnique({
    where: { id },
    select: { ...rateCardDetailSelect, deletedAt: true },
  });

  if (!rateCard || rateCard.deletedAt) {
    throw new AppError("Ratecard not found", 404, ErrorCode.NOT_FOUND);
  }

  const { deletedAt: _deletedAt, ...safeRateCard } = rateCard;
  return safeRateCard;
}

export async function updateRateCard(
  id: string,
  input: UpdateRateCardInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.rateCard.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Ratecard not found", 404, ErrorCode.NOT_FOUND);
      }

      const effectiveFrom = input.effectiveFrom ?? existing.effectiveFrom;
      const effectiveTo =
        input.effectiveTo !== undefined
          ? input.effectiveTo
          : existing.effectiveTo;
      assertDateRange(effectiveFrom, effectiveTo);

      const data: Prisma.RateCardUncheckedUpdateInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.description !== undefined) {
        data.description = input.description;
      }
      if (input.vehicleCategory !== undefined) {
        data.vehicleCategory = input.vehicleCategory;
      }
      if (input.rentalType !== undefined) data.rentalType = input.rentalType;
      if (input.dailyRate !== undefined) data.dailyRate = input.dailyRate;
      if (input.weeklyRate !== undefined) data.weeklyRate = input.weeklyRate;
      if (input.fortnightlyRate !== undefined) {
        data.fortnightlyRate = input.fortnightlyRate;
      }
      if (input.monthlyRate !== undefined) {
        data.monthlyRate = input.monthlyRate;
      }
      if (input.securityDeposit !== undefined) {
        data.securityDeposit = input.securityDeposit;
      }
      if (input.effectiveFrom !== undefined) {
        data.effectiveFrom = input.effectiveFrom;
      }
      if (input.effectiveTo !== undefined) data.effectiveTo = input.effectiveTo;

      const terms = termsInput(input.terms);
      if (terms !== undefined) data.terms = terms;

      const rateCard = await tx.rateCard.update({
        where: { id },
        data,
        select: rateCardDetailSelect,
      });

      const { terms: _oldTerms, ...rateCardBefore } = existing;
      const { terms: _newTerms, ...rateCardAfter } = rateCard;

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "RateCard",
        resourceId: rateCard.id,
        oldData: rateCardBefore,
        newData: rateCardAfter,
        summary: `${actor.userName} updated ratecard ${rateCard.code}.`,
        db: tx,
        throwOnError: true,
      });

      return rateCard;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "A ratecard with this code already exists") ?? err;
  }
}

export async function changeRateCardStatus(
  id: string,
  input: ChangeRateCardStatusInput,
  actor: AuditActor
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.rateCard.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Ratecard not found", 404, ErrorCode.NOT_FOUND);
      }

      if (existing.isActive === input.isActive) {
        throw new AppError(
          `Ratecard is already ${input.isActive ? "active" : "inactive"}`,
          409,
          ErrorCode.CONFLICT
        );
      }

      const updateResult = await tx.rateCard.updateMany({
        where: {
          id,
          isActive: existing.isActive,
        },
        data: { isActive: input.isActive },
      });

      if (updateResult.count === 0) {
        throw new AppError(
          "Ratecard status was modified concurrently; please retry",
          409,
          ErrorCode.CONFLICT
        );
      }

      const rateCard = {
        ...existing,
        isActive: input.isActive,
      };

      const { terms: _oldTerms, ...rateCardBefore } = existing;
      const { terms: _newTerms, ...rateCardAfter } = rateCard;

      await logAudit({
        ...actor,
        action: "UPDATE",
        resource: "RateCard",
        resourceId: id,
        oldData: rateCardBefore,
        newData: {
          ...rateCardAfter,
          reason: input.reason ?? null,
        },
        summary: `${actor.userName} changed ratecard ${existing.code} status to ${
          input.isActive ? "ACTIVE" : "INACTIVE"
        }.`,
        db: tx,
        throwOnError: true,
      });

      return { rateCard };
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Ratecard status could not be changed") ?? err;
  }
}

export async function deleteRateCard(id: string, actor: AuditActor) {
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.rateCard.findUnique({ where: { id } });
      if (!existing || existing.deletedAt) {
        throw new AppError("Ratecard not found", 404, ErrorCode.NOT_FOUND);
      }

      const deletedAt = new Date();
      const rateCard = await tx.rateCard.update({
        where: { id },
        data: { deletedAt, isActive: false },
        select: rateCardDetailSelect,
      });

      const { terms: _oldTerms, ...rateCardBefore } = existing;
      const { terms: _newTerms, ...rateCardAfter } = rateCard;

      await logAudit({
        ...actor,
        action: "DELETE",
        resource: "RateCard",
        resourceId: rateCard.id,
        oldData: rateCardBefore,
        newData: rateCardAfter,
        summary: `${actor.userName} soft-deleted ratecard ${existing.code}.`,
        db: tx,
        throwOnError: true,
      });

      return rateCard;
    });
  } catch (err) {
    throw AppError.fromPrisma(err, "Ratecard could not be deleted") ?? err;
  }
}
