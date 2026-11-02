// src/validation/rider.ts
import { z } from "zod";
export const createRiderSchema = z.object({
  fullName: z.string().trim().min(1, "fullName is required"),
  userId: z.string().min(1, "userId is required"),
  riderCode: z.string().trim().min(1).optional(),
  phoneNumber: z.string().trim().optional(),
  hubId: z.string().optional(),
});
export const updateRiderSchema = createRiderSchema.partial();
