import prisma from "../database/prismaClient.js";
import { AppError, ErrorCode } from "../utils/errors.js";

export type ManualRentalPricingInput = {
  dailyRate: string | number;
  weeklyRate?: string | number | null;
  fortnightlyRate?: string | number | null;
  monthlyRate?: string | number | null;
  securityDeposit?: string | number | null;
  currency?: string;
  notes?: string | null;
};

export type ResolveRentalPricingInput = {
  clientId: string;
  rateCardId?: string | null;
  effectiveAt?: Date;
  manualPricing?: ManualRentalPricingInput | null;
};

type PricingRates = {
  dailyRate: string;
  weeklyRate: string | null;
  fortnightlyRate: string | null;
  monthlyRate: string | null;
};

function decimalString(
  value: string | number | null | undefined,
  field: string,
  scale: number,
  options: { required?: boolean; positive?: boolean } = {}
): string | null {
  if (value === undefined || value === null || value === "") {
    if (options.required) {
      throw new AppError(
        `${field} is required for manual rental pricing`,
        400,
        ErrorCode.VALIDATION_ERROR
      );
    }
    return null;
  }

  const text = typeof value === "number" ? String(value) : value.trim();
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  if (!pattern.test(text)) {
    throw new AppError(
      `${field} must be a non-negative decimal with at most ${scale} decimal places`,
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  if (options.positive && Number(text) <= 0) {
    throw new AppError(
      `${field} must be greater than 0`,
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  return text;
}

function normalizeCurrency(value: string | undefined) {
  const currency = (value ?? "INR").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new AppError(
      "currency must be a 3-letter ISO code",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }
  return currency;
}

function manualPricing(
  input: ManualRentalPricingInput,
  clientId: string,
  capturedAt: Date
) {
  const rates: PricingRates = {
    dailyRate: decimalString(input.dailyRate, "dailyRate", 4, {
      required: true,
      positive: true,
    }) as string,
    weeklyRate: decimalString(input.weeklyRate, "weeklyRate", 4),
    fortnightlyRate: decimalString(input.fortnightlyRate, "fortnightlyRate", 4),
    monthlyRate: decimalString(input.monthlyRate, "monthlyRate", 4),
  };
  const securityDeposit = decimalString(
    input.securityDeposit,
    "securityDeposit",
    2
  );
  const currency = normalizeCurrency(input.currency);

  return {
    source: "MANUAL" as const,
    clientId,
    rateCardId: null,
    billingFrequency: null,
    currency,
    rates,
    securityDepositRequired: securityDeposit,
  };
}

export async function resolveRentalPricing(
  input: ResolveRentalPricingInput
) {
  const effectiveAt = input.effectiveAt ?? new Date();
  const hasRateCard = Boolean(input.rateCardId);
  const hasManualPricing = Boolean(input.manualPricing);

  if (hasRateCard && hasManualPricing) {
    throw new AppError(
      "Provide either a ratecard or explicit manual pricing, not both",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  if (!hasRateCard && !hasManualPricing) {
    throw new AppError(
      "A ratecard or explicit manual pricing is required; a missing ratecard does not mean zero rental price",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, deletedAt: true },
  });

  if (!client || client.deletedAt) {
    throw new AppError("Client not found", 404, ErrorCode.NOT_FOUND);
  }

  if (input.manualPricing) {
    return manualPricing(input.manualPricing, input.clientId, effectiveAt);
  }

  const rateCard = await prisma.rateCard.findFirst({
    where: {
      id: input.rateCardId as string,
      isActive: true,
      deletedAt: null,
      effectiveFrom: { lte: effectiveAt },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveAt } }],
    },
    select: {
      id: true,
      code: true,
      name: true,
      vehicleCategory: true,
      billingFrequency: true,
      dailyRate: true,
      weeklyRate: true,
      fortnightlyRate: true,
      monthlyRate: true,
      securityDeposit: true,
      currency: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });

  if (!rateCard) {
    throw new AppError(
      "Ratecard is not active for the requested date",
      409,
      ErrorCode.CONFLICT
    );
  }

  const rates: PricingRates = {
    dailyRate: String(rateCard.dailyRate),
    weeklyRate:
      rateCard.weeklyRate === null ? null : String(rateCard.weeklyRate),
    fortnightlyRate:
      rateCard.fortnightlyRate === null
        ? null
        : String(rateCard.fortnightlyRate),
    monthlyRate:
      rateCard.monthlyRate === null ? null : String(rateCard.monthlyRate),
  };
  const securityDeposit =
    rateCard.securityDeposit === null
      ? null
      : String(rateCard.securityDeposit);

  return {
    source: "RATE_CARD" as const,
    clientId: input.clientId,
    rateCardId: rateCard.id,
    billingFrequency: rateCard.billingFrequency,
    currency: rateCard.currency,
    rates,
    securityDepositRequired: securityDeposit,
  };
}
