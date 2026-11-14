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
  hub: prisma.hub,
  client: prisma.client,
  ratecard: prisma.rateCard,
  rental: prisma.rental,
  deposit: prisma.deposit,
  collection: prisma.collection,
  earning: prisma.ledgerEntry,
  payStatement: prisma.riderPayStatement,
  payout: prisma.payout,
  service: prisma.service,
  spare: prisma.spare,
  inventory: prisma.inventoryMovement,
  // Aggregate-only resources have no dedicated table. They are authorized
  // with policy:false, and auditLog is used only as a safe read-only delegate
  // so the registry contract remains complete.
  dashboard: prisma.auditLog,
  report: prisma.auditLog,
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