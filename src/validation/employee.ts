// src/validation/employee.ts  (same shape as driver)
import { z } from "zod";
export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  userId: z.string().min(1, "userId is required"),
});
export const updateEmployeeSchema = createEmployeeSchema.partial();