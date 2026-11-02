// src/validation/staff.ts
import { z } from "zod";
export const createStaffSchema = z.object({
  fullName: z.string().trim().min(1, "fullName is required"),
  userId: z.string().min(1, "userId is required"),
  employeeCode: z.string().trim().min(1).optional(),
  phoneNumber: z.string().trim().optional(),
  hubId: z.string().optional(),
  jobTitle: z.string().trim().optional(),
});
export const updateStaffSchema = createStaffSchema.partial();
