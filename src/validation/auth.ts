import { z } from "zod";
import envConfig from "../config/env.js";

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, "phone must contain 7 to 15 digits");

export const forgotPasswordSchema = z
  .object({
    identifier: z.string().trim().min(3).max(254).optional(),
    phone: phoneSchema.optional(),
    email: z.string().trim().email().max(254).optional(),
  })
  .strict()
  .refine(
    (value) => Boolean(value.identifier || value.phone || value.email),
    "Provide an email, phone number or identifier"
  );

export function validatePasswordStrength(password: string): string | null {
  const minLength = envConfig.passwordResetMinLength;
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters long`;
  }
  if (!/[A-Za-z]/.test(password)) {
    return "Password must contain at least one letter";
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number";
  }
  return null;
}

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(16, "token is required").max(512),
    newPassword: z
      .string()
      .min(1, "newPassword is required")
      .superRefine((value, ctx) => {
        const message = validatePasswordStrength(value);
        if (message) {
          ctx.addIssue({ code: "custom", message });
        }
      }),
  })
  .strict();

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
