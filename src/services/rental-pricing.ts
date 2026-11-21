import { AppError } from "../utils/errors.js";

export type ManualRentalPricingInput = {
  dailyRate: string | number;
  weeklyRate?: string | number | null;
  fortnightlyRate?: string | number | null;
  monthlyRate?: string | number | null;
  securityDeposit?: string | number | null;
  notes?: string | null;
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
      throw new AppError(`${field} is required`, 400);
    }
    return null;
  }

  const text = typeof value === "number" ? String(value) : value.trim();
  const pattern = new RegExp(`^\\d+(\\.\\d{1,${scale}})?$`);
  if (!pattern.test(text)) {
    throw new AppError(
      `${field} must be a non-negative decimal with at most ${scale} decimal places`,
      400
    );
  }

  if (options.positive && Number(text) <= 0) {
    throw new AppError(`${field} must be greater than 0`, 400);
  }

  return text;
}

export function resolveRentalPricing(input: ManualRentalPricingInput): {
  rates: PricingRates;
  securityDepositRequired: string | null;
} {
  const rates: PricingRates = {
    dailyRate: decimalString(input.dailyRate, "dailyRate", 4, {
      required: true,
      positive: true,
    }) as string,
    weeklyRate: decimalString(input.weeklyRate, "weeklyRate", 4),
    fortnightlyRate: decimalString(input.fortnightlyRate, "fortnightlyRate", 4),
    monthlyRate: decimalString(input.monthlyRate, "monthlyRate", 4),
  };

  return {
    rates,
    securityDepositRequired: decimalString(
      input.securityDeposit,
      "securityDeposit",
      2
    ),
  };
}
