import { z } from "zod";
import {
  dateRangeRefinement,
  dateRangeShape,
  hasValidDateRange,
  trendGroupSchema,
} from "./reporting.js";

export const dashboardQuerySchema = z
  .object({
    ...dateRangeShape,
    groupBy: trendGroupSchema.default("DAILY"),
  })
  .refine(hasValidDateRange, dateRangeRefinement);

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
