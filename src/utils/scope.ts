import type { UserContext } from "../types/user.js";
import { AppError, ErrorCode } from "./errors.js";

export function isAdmin(user?: UserContext | null) {
  return user?.role === "ADMIN";
}

export function actorHubId(user?: UserContext | null): string | null {
  const value = user?.attributes?.hubId;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Verifies that an actor may access a record belonging to the supplied hub.
 * Administrators are exempt. A non-admin with no assigned hub keeps the
 * historical behaviour (no hub restriction); a non-admin assigned to a hub can
 * only access that hub.
 */
export function assertHubAccess(
  user: UserContext | undefined,
  hubId: string | null | undefined
) {
  if (!user || isAdmin(user)) return;
  const scopedHub = actorHubId(user);
  if (!scopedHub) return;
  if (!hubId || hubId !== scopedHub) {
    throw new AppError(
      "You do not have access to records outside your assigned hub",
      403,
      ErrorCode.FORBIDDEN
    );
  }
}

/**
 * Resolves the hub filter to apply to a list query. A non-admin with an
 * assigned hub cannot request a different hub.
 */
export function resolveHubFilter(
  user: UserContext | undefined,
  requestedHubId?: string | null
): string | undefined {
  if (!user || isAdmin(user)) return requestedHubId ?? undefined;
  const scopedHub = actorHubId(user);
  if (!scopedHub) return requestedHubId ?? undefined;
  if (requestedHubId && requestedHubId !== scopedHub) {
    throw new AppError(
      "You do not have access to records outside your assigned hub",
      403,
      ErrorCode.FORBIDDEN
    );
  }
  return scopedHub;
}
