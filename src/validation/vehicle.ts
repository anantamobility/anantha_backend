// src/validation/vehicle.ts
import { z } from "zod";
export const createVehicleSchema = z.object({
  registrationNumber: z.string().trim().min(1, "registrationNumber is required").max(10, "must be at most 10 characters"),
});
export const updateVehicleSchema = createVehicleSchema.partial();