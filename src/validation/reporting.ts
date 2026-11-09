import { z } from "zod";

export const trendGroupSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);

export const dateRangeShape = {
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
};

export function hasValidDateRange(query: {
  startDate?: Date;
  endDate?: Date;
}): boolean {
  return (
    !query.startDate ||
    !query.endDate ||
    query.startDate.getTime() <= query.endDate.getTime()
  );
}

export const dateRangeRefinement = {
  message: "startDate must be before or equal to endDate",
  path: ["startDate"],
};

export const trendsQuerySchema = z
  .object({
    ...dateRangeShape,
    groupBy: trendGroupSchema.default("DAILY"),
  })
  .refine(hasValidDateRange, dateRangeRefinement);

export type TrendsQuery = z.infer<typeof trendsQuerySchema>;
