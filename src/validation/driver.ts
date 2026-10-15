// src/validation/driver.ts
import { z } from "zod";
export const createDriverSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  userId: z.string().min(1, "userId is required"),
});
export const updateDriverSchema = createDriverSchema.partial();