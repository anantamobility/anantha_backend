export type RoleName = 'ADMIN' | 'SUPERVISOR' | 'OPERATOR';

/** Minimal read-only shape required to derive role permission buckets. */
export type PermissionGroup = {
  readonly resource: string;
  readonly actions: readonly string[];
};

/**
 * Pure helper that maps the permission registry into the permission keys
 * granted to each role. Side-effect free so it can be imported without
 * touching the database.
 */
export function getRolePermissionBuckets(
  registry: readonly PermissionGroup[]
): Record<RoleName, string[]> {
  const buckets: Record<RoleName, string[]> = {
    ADMIN: [],
    SUPERVISOR: [],
    OPERATOR: [],
  };

  for (const group of registry) {
    for (const action of group.actions) {
      const key = `${group.resource}:${action}`;

      // ADMIN receives all registered permissions.
      buckets.ADMIN.push(key);

      // SUPERVISOR receives limited user, role, and audit permissions.
      if (
        group.resource === 'user' &&
        ['read', 'update'].includes(action)
      ) {
        buckets.SUPERVISOR.push(key);
      }

      if (group.resource === 'role' && action === 'read') {
        buckets.SUPERVISOR.push(key);
      }

      if (group.resource === 'auditLog' && action === 'read') {
        buckets.SUPERVISOR.push(key);
      }

      // SUPERVISOR may manage B2B clients, commercial ratecards and their
      // assignments, plus the full rental/financial workflow.
      if (
        [
          'client',
          'ratecard',
          'ratecardAssignment',
          'rental',
          'deposit',
          'collection',
        ].includes(group.resource)
      ) {
        buckets.SUPERVISOR.push(key);
      }

      // OPERATOR receives read-only operational permissions. Ratecard pricing
      // and financial mutations remain restricted to ADMIN and SUPERVISOR.
      if (
        [
          'rider',
          'staff',
          'vehicle',
          'hub',
          'client',
          'rental',
          'deposit',
          'collection',
        ].includes(group.resource) &&
        action === 'read'
      ) {
        buckets.OPERATOR.push(key);
      }
    }
  }

  return buckets;
}
