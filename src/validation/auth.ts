import { z } from "zod";
import envConfig from "../config/env.js";

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, "phone must contain 7 to 15 digits");


export function validatePasswordStrength(password: string): string | null {
  const minLength = 8;
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

