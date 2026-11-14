import { AppError, ErrorCode } from "./errors.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_DAYS = 30;

export function resolveTrendRange(query: {
  startDate?: Date;
  endDate?: Date;
}): { startDate: Date; endDate: Date } {
  const endDate = query.endDate ?? new Date();
  const startDate =
    query.startDate ??
    new Date(endDate.getTime() - (DEFAULT_RANGE_DAYS - 1) * MS_PER_DAY);

  if (startDate.getTime() > endDate.getTime()) {
    throw new AppError(
      "startDate must be before or equal to endDate",
      400,
      ErrorCode.VALIDATION_ERROR
    );
  }

  return { startDate, endDate };
}
