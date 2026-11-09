import { z } from "zod";
import { paginationQuerySchema, searchQuerySchema } from "./common.js";
import {
  dateRangeRefinement,
  dateRangeShape,
  hasValidDateRange,
} from "./reporting.js";

const uuidFilter = (field: string) =>
  z.string().uuid(`${field} must be a valid UUID`).optional();

export const reportFormatSchema = z.enum(["json", "csv"]);

const reportBaseSchema = paginationQuerySchema
  .extend(searchQuerySchema.shape)
  .extend(dateRangeShape)
  .extend({
    format: reportFormatSchema.default("json"),
    hubId: uuidFilter("hubId"),
    clientId: uuidFilter("clientId"),
    riderId: uuidFilter("riderId"),
    vehicleId: uuidFilter("vehicleId"),
    rentalId: uuidFilter("rentalId"),
    spareId: uuidFilter("spareId"),
  })
  .refine(hasValidDateRange, dateRangeRefinement);

export const collectionsReportQuerySchema = reportBaseSchema.extend({
  status: z
    .enum(["PENDING", "CLEARED", "FAILED", "REFUNDED", "REVERSED"])
    .optional(),
  payerType: z.enum(["CLIENT", "RIDER"]).optional(),
  paymentMethod: z
    .enum(["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"])
    .optional(),
});

export const hubReportQuerySchema = reportBaseSchema.extend({
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const b2cReportQuerySchema = reportBaseSchema.extend({
  status: z
    .enum([
      "DRAFT",
      "PENDING_APPROVAL",
      "ACTIVE",
      "ON_HOLD",
      "COMPLETED",
      "TERMINATED",
      "CANCELLED",
    ])
    .optional(),
});

export const b2bReportQuerySchema = b2cReportQuerySchema;

export const riderReportQuerySchema = reportBaseSchema.extend({
  status: z
    .enum(["ONBOARDING", "ACTIVE", "SUSPENDED", "INACTIVE", "TERMINATED"])
    .optional(),
  rentalType: z.enum(["B2C", "B2B"]).optional(),
});

export const vehicleReportQuerySchema = reportBaseSchema.extend({
  status: z
    .enum([
      "IDLE",
      "DEPLOYED",
      "IN_SERVICE",
      "UNDER_REPAIR",
      "OUT_OF_SERVICE",
      "RETIRED",
    ])
    .optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const serviceReportQuerySchema = reportBaseSchema.extend({
  status: z
    .enum([
      "REPORTED",
      "APPROVED",
      "IN_PROGRESS",
      "AWAITING_PARTS",
      "COMPLETED",
      "CLOSED",
      "CANCELLED",
    ])
    .optional(),
  serviceType: z
    .enum(["TECHNICAL", "PREVENTIVE", "ACCIDENT", "RIDER_DAMAGE", "OTHER"])
    .optional(),
  responsibleParty: z
    .enum(["AML", "RIDER", "CLIENT", "THIRD_PARTY", "INSURANCE", "UNKNOWN"])
    .optional(),
});

export const sparesReportQuerySchema = reportBaseSchema.extend({
  category: z.string().trim().min(1).max(100).optional(),
  isActive: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  belowMinimum: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const inventoryReportQuerySchema = reportBaseSchema.extend({
  belowMinimum: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const staffReportQuerySchema = reportBaseSchema.extend({
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED"]).optional(),
});

export type ReportFormat = z.infer<typeof reportFormatSchema>;
export type CollectionsReportQuery = z.infer<
  typeof collectionsReportQuerySchema
>;
export type HubReportQuery = z.infer<typeof hubReportQuerySchema>;
export type B2CReportQuery = z.infer<typeof b2cReportQuerySchema>;
export type B2BReportQuery = z.infer<typeof b2bReportQuerySchema>;
export type RiderReportQuery = z.infer<typeof riderReportQuerySchema>;
export type VehicleReportQuery = z.infer<typeof vehicleReportQuerySchema>;
export type ServiceReportQuery = z.infer<typeof serviceReportQuerySchema>;
export type SparesReportQuery = z.infer<typeof sparesReportQuerySchema>;
export type InventoryReportQuery = z.infer<typeof inventoryReportQuerySchema>;
export type StaffReportQuery = z.infer<typeof staffReportQuerySchema>;
