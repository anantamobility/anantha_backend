# Users, Authentication, Security and Audit Logging

This module covers account authentication, administrative user management, password reset, RBAC/PBAC, hub-scoped access, soft deletes and audit-log reads.

## Authentication

| Method | Endpoint | Notes |
| --- | --- | --- |
| `POST` | `/auth/signup` | Public account creation. New accounts start in the configured onboarding state until activated. |
| `POST` | `/auth/login` | Accepts phone + password. Deleted users are rejected; non-`ACTIVE` users receive `403`. |
| `POST` | `/auth/tokenRefresh` | Refreshes an access token. |
| `POST` | `/auth/logout` | Revokes the current session. |
| `POST` | `/auth/change-password` | Authenticated. Applies the configured password-strength rules. |
| `POST` | `/auth/forgot-password` | Public. See [Password reset](#password-reset). |
| `POST` | `/auth/reset-password` | Public. Consumes a single-use reset token. |

Access tokens carry a session id. Every protected request verifies the token signature and checks `session:<userId>` in Redis. A missing or mismatched session returns `401`; an unavailable Redis instance skips only the session-value comparison and logs a warning.

Token verification reloads the user from PostgreSQL on each request. Deleted users return `401`; users whose status is not `ACTIVE` return `403`. The request context includes the user's role, permission strings, and `attributes.hubId` from their staff profile.

## User management API

All routes require a bearer token and are mounted at `/users`.

| Method | Endpoint | Required permission | Notes |
| --- | --- | --- | --- |
| `POST` | `/users` | `user:create` | Requires `name`, `phoneNumber`, `password`, and either `roleId` or `roleName`. |
| `GET` | `/users` | `user:read` | Supports `page`, `limit`, `search`, `roleId`, `status`, `sortBy`, `sortOrder`. |
| `GET` | `/users/:id` | `user:read` + policy | Admins may read any user; non-admins may read themselves under the current policy. |
| `PATCH`/`PUT` | `/users/:id` | `user:update` + policy | Updates name, email and phone only. |
| `PATCH` | `/users/:id/role` | `user:role:assign` | Body: `roleId`, optional `reason`. |
| `PATCH` | `/users/:id/status` | `user:status:update` | Body: `status` (`ONBOARDING`, `ACTIVE`, `SUSPENDED`), optional `reason`. |
| `POST` | `/users/:id/revoke-sessions` | `user:session:revoke` | Deletes the user's Redis session and refresh state. |
| `DELETE` | `/users/:id` | `user:delete` | Soft delete: sets `deletedAt` and `SUSPENDED`. |

Password hashes are never selected by the API.

### Safety guards

- An administrator cannot remove their own administrator role.
- An administrator cannot deactivate their own account.
- An administrator cannot delete their own account.
- The last active administrator cannot be demoted, deactivated or deleted (`409`).
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

`create`, `read`, `update`, `delete`, `role:assign`, `status:update`, `session:revoke`.

`UserPolicies` currently make administrative lifecycle actions admin-only and limit non-admin profile read/update to the actor's own record. Service-layer hub checks provide defense in depth if policies are extended later.

Permission buckets are derived by `getRolePermissionBuckets` in `src/database/roles.ts`:

- `ADMIN`: all registered permissions.
- `SUPERVISOR`: user read/update, role read, audit read, B2B clients, ratecards/assignments, rental/financial workflow, services/spares/inventory, dashboards/reports.
- `OPERATOR`: read-only access to riders, staff, vehicles, hubs, clients, rentals, deposits, collections, services, spares and inventory.

## Hub-scoped access

A non-admin actor with `attributes.hubId` is restricted to that hub:

- List endpoints for vehicles, staff, riders, rentals and hubs apply the hub filter automatically.
- Detail reads and mutations for vehicles, staff, riders, rentals and hubs reject records outside the actor's hub with `403`.
- Vehicle and rider status-history reads enforce the same rule.
- User lists are limited to the actor themselves plus users whose staff profile is in the actor's hub.
- Attempting to request a different `hubId` filter returns `403`.

Non-admin actors with **no** assigned hub retain the historical unrestricted behavior. Administrators always bypass hub scoping.

## Password reset

`POST /auth/forgot-password` accepts one of `identifier`, `email` or `phone`. It always returns the same generic message, even when no active account matches.

For an active account:

1. A 32-byte random token is generated with `base64url` encoding.
2. Only a SHA-256 hash is stored in `password_reset_tokens`.
3. All previous unused reset tokens for the user are marked used.
4. A new token is stored with an expiry and requesting IP.
5. Delivery is attempted through the configured notification provider.
6. An audit event records whether delivery was accepted, the provider/channel, and a non-delivered reason. The raw token is never logged.

`POST /auth/reset-password` accepts `token` and `newPassword`. It requires a strong password, consumes the token atomically, updates the password hash, invalidates all outstanding reset tokens for the user, and deletes `session:<userId>` so existing sessions must sign in again. Invalid, expired, reused, deleted-user and inactive-user tokens all return `400` with the same message.

Requests are limited per IP + identifier using an in-process fixed window. The window reset is process-local, so deployments with multiple API processes should additionally rate-limit at the edge.

### Notification configuration

| Variable | Values | Behavior |
| --- | --- | --- |
| `NOTIFICATION_EMAIL_PROVIDER` | `none`, `webhook` | `none` reports `delivered:false`; `webhook` posts JSON to `NOTIFICATION_EMAIL_WEBHOOK_URL`. |
| `NOTIFICATION_SMS_PROVIDER` | `none`, `http` | `none` reports `delivered:false`; `http` posts JSON to `SMS_API_URL`. |
| `APP_BASE_URL` | URL | Base URL used to build the reset link in email messages. |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | integer | Token lifetime; default `30`. |
| `PASSWORD_RESET_MAX_REQUESTS_PER_HOUR` | integer | Per IP + identifier limit; default `5`. |
| `PASSWORD_RESET_MIN_LENGTH` | integer | Minimum password length; default `8`. Passwords also need a letter and a number. |

If email delivery is configured but the user has no email address, delivery reports failure with a reason. If no provider is configured, the API does not claim a message was sent. SMTP variables are reserved for a future adapter; only `webhook` and `http` are implemented.

## Soft deletes

The following records use `deletedAt` instead of hard deletion:

| Resource | Delete endpoint | Dependency guards |
| --- | --- | --- |
| User | `DELETE /users/:id` | Last-admin/self guards; sets status to `SUSPENDED`. |
| Client | `DELETE /clients/:id` | Refuses open rentals and open invoices. |
| Rider | `DELETE /riders/:id` | Refuses open rentals, open settlements and open payouts. |
| Ratecard | `DELETE /ratecards/:id` | Refuses any rental or assignment referencing it. |

Deleted records are excluded from normal list/detail reads and return `404`. Historical foreign-key references remain intact. Hub deletion is intentionally unchanged and still requires a hub with no associated records.

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
