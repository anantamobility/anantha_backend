export type RoleName = 'ADMIN' | 'SUPERVISOR' | 'RIDER';

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
    RIDER: [],
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

      // SUPERVISOR may manage B2B clients and commercial ratecards,
      // plus the full rental/financial workflow.
      if (
        [
          'client',
          'ratecard',
          'rental',
          'deposit',
          'collection',
        ].includes(group.resource)
      ) {
        // Consolidated B2B client financials and rider earnings/pay-statements
        // are ADMIN-only capabilities.
        if (group.resource === 'collection' && action.startsWith('client:')) {
          continue;
        }
        buckets.SUPERVISOR.push(key);
      }

      // SUPERVISOR owns the full operational service, spares and inventory
      // workflow, including damage responsibility approval.
      if (['service', 'spare', 'inventory'].includes(group.resource)) {
        buckets.SUPERVISOR.push(key);
      }

      // Dashboards and cross-cutting reports expose financial and operational
      // data, so they are limited to ADMIN and SUPERVISOR.
      if (['dashboard', 'report'].includes(group.resource)) {
        buckets.SUPERVISOR.push(key);
      }
    }
  }

  return buckets;
}
