import prisma from '../database/prismaClient.js';
import type { AppResource } from "./perm.js";

/**
 * Central allowlist: public resource name -> Prisma model delegate.
 * Only resources declared in PERMISSION_REGISTRY may appear here.
 */

export const MODEL_REGISTRY = {
  user: prisma.user,
  role: prisma.role,
  auditLog: prisma.auditLog,
  rider: prisma.rider,
  staff: prisma.staff,
  vehicle: prisma.vehicle,
} as const satisfies Record<AppResource, unknown>;

/**
 * Safe lookup. Returns the delegate for an approved resource, or null.
 * Never let arbitrary HTTP input reach Prisma directly.
 */
type ModelDelegate = {
  findFirst(args: { where: Record<string, unknown> }): Promise<unknown>;
};

export function getModelDelegate(resource: string): ModelDelegate | null {
  if (!Object.prototype.hasOwnProperty.call(MODEL_REGISTRY, resource)) {
    return null;
  }
  return MODEL_REGISTRY[resource as AppResource] as unknown as ModelDelegate;
}