import { z } from "zod";

// Reuse the same field helpers / base shape ideas from vehicle create.
// We import createVehicleSchema and adjust it for Excel rows.
import { createVehicleSchema } from "./vehicle.js";

/**
 * One row from the Excel/CSV file.
 * - Excel sends hubCode (human code), not hubId (database UUID).
 * - We omit tyres for v1 (hard to put in a spreadsheet).
 * - We omit hubId because we use hubCode instead.
 */
export const vehicleImportRowSchema = createVehicleSchema
  .omit({
    hubId: true,
    tyres: true,
  })
  .extend({
    hubCode: z
      .string()
      .trim()
      .min(1, "hubCode is required")
      .max(50, "hubCode must be at most 50 characters"),
  })
  .strict();

/**
 * The whole API body: a list of rows.
 * min(1) = at least one row
 * max(500) = don't allow huge accidental uploads in v1
 */
export const vehicleImportBodySchema = z
  .object({
    rows: z
      .array(vehicleImportRowSchema)
      .min(1, "rows must contain at least one row")
      .max(500, "rows cannot exceed 500"),
  })
  .strict();

// Types for TypeScript (other files will use these later)
export type VehicleImportRowInput = z.infer<typeof vehicleImportRowSchema>;
export type VehicleImportBody = z.infer<typeof vehicleImportBodySchema>;