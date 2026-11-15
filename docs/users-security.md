# Users, Authentication, Security and Audit Logging

This module covers account authentication, administrative user management, password reset, RBAC/PBAC, soft deletes and audit-log reads.

## Authentication

| Method | Endpoint | Notes |
| --- | --- | --- |
| `POST` | `/auth/signup` | Public account creation. New accounts start in the configured onboarding state until activated. |
| `POST` | `/auth/login` | Accepts phone + password. Deleted users are rejected; non-`ACTIVE` users receive `403`. |
| `POST` | `/auth/tokenRefresh` | Refreshes an access token. |
| `POST` | `/auth/logout` | Revokes the current session. |
| `POST` | `/auth/change-password` | Authenticated self-service password change. |
| `POST` | `/auth/reset-password/:userId` | Admin reset. Requires `user:resetPassword`. Body: `{ newPassword }`. Revokes the target user's Redis session and writes an audit row. Self-reset via this path is rejected. |

Access tokens carry a session id. Every protected request verifies the token signature and checks `session:<userId>` in Redis. A missing or mismatched session returns `401`; an unavailable Redis instance skips only the session-value comparison and logs a warning.

Token verification reloads the user from PostgreSQL on each request. Deleted users return `401`; users whose status is not `ACTIVE` return `403`. The request context includes the user's role and permission strings.

## User management API

All routes require a bearer token and are mounted at `/users`.

Accounts are no longer created here. `POST /staff` and `POST /riders` create the `User` row in the same transaction as the profile, because a user holds only credentials (`email`, `phoneNumber`, `passwordHash`, `status`, `role`) and the profile holds the person's name.

| Method | Endpoint | Required permission | Notes |
| --- | --- | --- | --- |
| `GET` | `/users` | `user:read` | Supports `page`, `limit`, `search`, `roleId`, `status`, `sortBy`, `sortOrder`. |
| `GET` | `/users/:id` | `user:read` + policy | Admins may read any user; non-admins may read themselves under the current policy. |
| `PATCH` | `/users/:id` | `user:update` + policy | Updates email and phone only. |
| `PATCH` | `/users/:id/role` | `user:role:assign` | Body: `roleId`, optional `reason`. |
| `PATCH` | `/users/:id/status` | `user:status:update` | Body: `status` (`ONBOARDING`, `ACTIVE`, `SUSPENDED`), optional `reason`. |
| `POST` | `/users/:id/revoke-sessions` | `user:session:revoke` | Deletes the user's Redis session and refresh state. |
| `DELETE` | `/users/:id` | `user:delete` | Soft delete: sets `deletedAt` and `SUSPENDED`. |

Password hashes are never selected by the API.

### Safety guards

- An administrator cannot remove their own administrator role.
- An administrator cannot deactivate their own account.
- An administrator cannot delete their own account.
- Role, status and delete changes are rejected for missing or already-deleted users.
- Revoking sessions fails with `503` if Redis cannot confirm revocation; success is never reported blindly.
- Administrative mutations write audit rows in the same transaction as the change, and audit failure rolls the transaction back.

## RBAC and PBAC

Permissions are defined in `src/registry/perm.ts`. The invariant is that `MODEL_REGISTRY` resources exactly match `PERMISSION_REGISTRY` resources. Add new **actions** to existing resources; do not add an unmodelled resource.

Authorization is deny-by-default:

1. `verifyToken` resolves the user, role, permissions and hub attribute.
2. `authorize(resource, action)` checks `resource:action` in the user's permission set.
3. When the policy option is enabled, the PBAC layer loads the target record and runs the resource policy.

The `user` resource defines these actions:

`create`, `read`, `update`, `delete`, `role:assign`, `status:update`, `session:revoke`, `resetPassword`.

`UserPolicies` currently make administrative lifecycle actions admin-only and limit non-admin profile read/update to the actor's own record. Service-layer hub checks provide defense in depth if policies are extended later.

Permission buckets are derived by `getRolePermissionBuckets` in `src/database/roles.ts`:

- `ADMIN`: all registered permissions.
- `SUPERVISOR`: user read/update, role read, audit read, B2B clients, ratecards/assignments, rental/financial workflow, services/spares/inventory, dashboards/reports.
- `RIDER`: no permissions. Rider accounts exist so a rider can authenticate; every staff endpoint rejects them.

## Access model

Authorization is permission-based only. A user with `vehicle:read` can read every vehicle, a user with `rental:create` can create a rental in any hub. There is no row-level or hub-level restriction in the current build.

The one row-level rule left is the user policy: a user can read and update their own account, administrators can act on any account. Everything else is decided by the `resource:action` permission string.

## Admin password reset

`POST /auth/reset-password/:userId` is an authenticated administrative action:

1. Requires `user:resetPassword` (ADMIN via the permission registry).
2. Rejects self-reset; use `/auth/change-password` for the actor's own password.
3. Validates `newPassword` with the shared password-strength rules.
4. Hashes and stores the new password, deletes `session:<userId>`, and audits `PASSWORD_RESET`.

Password strength is a fixed minimum of 8 characters plus the shared letter/number rules from `validatePasswordStrength`.

## Soft deletes

The following records use `deletedAt` instead of hard deletion:

| Resource | Delete endpoint | Dependency guards |
| --- | --- | --- |
| User | `DELETE /users/:id` | Last-admin/self guards; sets status to `SUSPENDED`. |
| Client | `DELETE /clients/:id` | Refuses open rentals and open invoices. |
| Rider | `DELETE /riders/:id` | Refuses open rentals, open pay statements and approved statements awaiting payment. |
| Ratecard | `DELETE /ratecards/:id` | Soft delete only; rentals copy their own rates, so no reference check applies. |

Deleted records are excluded from normal list/detail reads and return `404`. Historical foreign-key references remain intact.

Foreign keys are `Restrict` on delete everywhere, so no delete silently detaches or cascades. A hard delete is only possible once nothing references the row; code-level guards produce the friendly message first, and the database refuses with `409` if a guard is missed. Hub deletion is the only hard delete, and it requires a hub with no vehicles, staff, riders, rentals, assignments, contracts or inventory attached.

## Audit log API

`GET /audit-logs` requires `auditLog:read`. Admin and supervisor roles receive it.

| Query | Description |
| --- | --- |
| `page`, `limit` | Pagination. |
| `search` | Matches summary, actor name, resource id or IP address. |
| `userId` | Filter by actor UUID. |
| `resource`, `action` | Case-insensitive equality filters. |
| `status` | `SUCCESS` or `FAILURE`. |
| `from`, `to` | Inclusive `createdAt` range; `from` must not be after `to`. |
| `sortOrder` | `asc` or `desc` (default). |

Sensitive events include login success/failure, logout, password changes, password-reset requests/completions, user create/update/role/status/delete, session revocation, client/rider/ratecard soft deletes, and the existing operational mutations.

## Security checklist for deployments

- Replace both JWT secrets with long random values and never reuse the seed passwords.
- Run `npx prisma migrate deploy`; do not use `db push` in production.
- Put the API behind TLS and a rate-limiting reverse proxy.
- Use a private Redis instance; sessions and revocation depend on it.
- Configure a real reset-delivery provider and verify audit rows show `delivered:true`.
- Restrict database and Redis network access to application hosts.
- Run `npm run build` and `npm start` from a clean environment after migrations.
- Run `npm test` and, against a disposable schema, `npm run test:integration`.
