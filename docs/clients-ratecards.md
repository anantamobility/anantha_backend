# Clients, Ratecards and Assignments

B2B customer records, reusable commercial ratecards, and the assignment records that connect the two.

## Relationship model

```text
Client 1 --- * RateCardAssignment * --- 1 RateCard
                        |
                        * --- 1 Rental (optional reference)
```

- A `RateCard` is a reusable pricing configuration. It is **not** owned by a client and has no `clientId`.
- A `RateCardAssignment` links one client to one ratecard for a validity period and lifecycle status.
- A client may have zero, one or many different ratecard assignments.
- A ratecard may be assigned to many clients.
- Assignments are historical records. Unassigning cancels an assignment; it is never hard-deleted.
- At most one `ACTIVE` assignment may exist for the same `clientId + rateCardId`.

## Client model

| Field | Type | Rules |
| --- | --- | --- |
| `clientCode` | string | Optional on create; immutable afterwards. Auto-generated as `CLI-XXXXXXXX` when omitted. Unique, max 50 characters, letters/digits/`-`/`_` only. |
| `type` | `INDIVIDUAL`, `CORPORATE` | Required |
| `name` | string | Required, max 200 characters |
| `companyName`, `contactPerson`, `taxId` | string / null | Optional |
| `email` | string / null | Optional; must be a valid email address |
| `phoneNumber` | string / null | Optional; 7-15 digits, optional leading `+` |
| `billingAddress` | JSON / null | Optional JSON object |
| `paymentTermsDays` | integer / null | Optional; 0-365 |
| `isActive` | boolean | Optional on create, defaults to `true`; changed only through the status endpoint |

Clients are soft-deleted through `deletedAt`. Client endpoints and nested ratecard endpoints exclude deleted clients. Client delete is not exposed by this module.

Creating a client never requires a ratecard, and no assignment is created implicitly.

`GET /clients` supports `page`, `limit`, `search`, `type`, `isActive`, `sortBy` (`name`, `clientCode`, `createdAt`, `updatedAt`) and `sortOrder` (`asc`, `desc`). Search matches code, name, company, contact person, email, phone and tax ID. `GET /clients/:id` includes `_count.rateCardAssignments`.

## RateCard model

| Field | Type | Rules |
| --- | --- | --- |
| `code` | string | Optional on create; immutable afterwards. Auto-generated as `RC-XXXXXXXX` when omitted. Unique, max 50 characters, letters/digits/`-`/`_` only. |
| `name` | string | Required, max 200 characters |
| `description` | string / null | Optional, max 2000 characters |
| `vehicleCategory` | string / null | Optional free-text category, max 100 characters |
| `rentalType` | `B2C`, `B2B` / null | Optional |
| `billingFrequency` | `WEEKLY`, `FORTNIGHTLY`, `MONTHLY` / null | Optional |
| `dailyRate` | decimal string | Required, greater than 0, at most 4 decimal places |
| `weeklyRate`, `fortnightlyRate`, `monthlyRate` | decimal string / null | Optional, non-negative, at most 4 decimal places |
| `securityDeposit` | decimal string / null | Optional, non-negative, at most 2 decimal places |
| `currency` | string | Optional 3-letter ISO code, uppercased; defaults to `INR` |
| `effectiveFrom` | ISO date | Required |
| `effectiveTo` | ISO date / null | Optional; must be later than `effectiveFrom` |
| `terms` | JSON / null | Optional JSON object |
| `isActive` | boolean | Optional on create, defaults to `true`; changed only through the status endpoint |

`clientId` is not accepted by ratecard create or update. Sending it is a validation error. Monetary values may be sent as JSON strings or numbers and are stored as `Decimal`; the API never performs floating-point arithmetic.

Ratecards are reusable, so overlapping ratecard periods are allowed. Applicability is decided by an assignment, not by exclusive ownership.

`GET /ratecards/:id` includes `_count.assignments` and `_count.rentals`.

### Historical pricing

Once any rental references a ratecard (`Rental.rateCardId`), the ratecard's commercial terms are frozen. `PATCH /ratecards/:id` returns `409 CONFLICT` if the body contains any of `vehicleCategory`, `rentalType`, `billingFrequency`, `dailyRate`, `weeklyRate`, `fortnightlyRate`, `monthlyRate`, `securityDeposit`, `currency`, `effectiveFrom`, `effectiveTo` or `terms`. `name` and `description` remain editable. Create a new ratecard for new pricing instead of rewriting history.

## RateCardAssignment model

| Field | Type | Rules |
| --- | --- | --- |
| `clientId` | UUID | Required; must reference an existing, non-deleted client |
| `rateCardId` | UUID | Required; must reference an existing ratecard |
| `validFrom` | ISO date | Optional on create, defaults to now |
| `validUntil` | ISO date / null | Optional; must be later than `validFrom`; `null` means open-ended |
| `status` | `ACTIVE`, `INACTIVE`, `CANCELLED` | Optional on create, defaults to `ACTIVE`. Create/update body accepts only `ACTIVE` or `INACTIVE`. |
| `reason` | string / null | Optional, max 500 characters |
| `assignedAt`, `assignedById` | timestamp, UUID / null | Set automatically from the authenticated actor |
| `unassignedAt`, `unassignedById` | timestamp, UUID / null | Set by the unassign endpoint |

Rules:

- Creating an `ACTIVE` assignment requires an active, non-deleted client and an active ratecard.
- Creating an `INACTIVE` assignment requires the client and ratecard to exist, but either may be inactive.
- Duplicate active assignments are rejected with `409 CONFLICT`. The database also enforces this with partial unique index `rate_card_assignments_active_pair_key`.
- Reactivating an `INACTIVE` assignment repeats the active client/ratecard and duplicate checks.
- `CANCELLED` assignments cannot be modified.
- `DELETE /ratecard-assignments/:id` soft-unassigns by setting `status = CANCELLED`, `unassignedAt`, `unassignedById` and optionally `reason`.
- Unassigning is blocked with `409 CONFLICT` when the assignment is referenced by a rental in `DRAFT`, `PENDING_APPROVAL`, `ACTIVE` or `ON_HOLD`.
- A client and ratecard pair may be assigned again after the previous assignment is `CANCELLED` or `INACTIVE`.

## Endpoints

All routes require a bearer token. `PUT` is a compatibility alias for `PATCH` on client and ratecard update routes.

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/clients` | `client:create` |
| `GET` | `/clients` | `client:read` |
| `GET` | `/clients/:id` | `client:read` |
| `PATCH` / `PUT` | `/clients/:id` | `client:update` |
| `PATCH` | `/clients/:id/status` | `client:status:update` |
| `GET` | `/clients/:id/ratecards` | `ratecardAssignment:read` |
| `POST` | `/ratecards` | `ratecard:create` |
| `GET` | `/ratecards` | `ratecard:read` |
| `GET` | `/ratecards/:id` | `ratecard:read` |
| `GET` | `/ratecards/:id/clients` | `ratecardAssignment:read` |
| `PATCH` / `PUT` | `/ratecards/:id` | `ratecard:update` |
| `PATCH` | `/ratecards/:id/status` | `ratecard:status:update` |
| `POST` | `/ratecard-assignments` | `ratecardAssignment:create` |
| `GET` | `/ratecard-assignments` | `ratecardAssignment:read` |
| `GET` | `/ratecard-assignments/:id` | `ratecardAssignment:read` |
| `PATCH` | `/ratecard-assignments/:id` | `ratecardAssignment:update` |
| `DELETE` | `/ratecard-assignments/:id` | `ratecardAssignment:delete` |

### Ratecard queries

`GET /ratecards` supports `page`, `limit`, `search`, `vehicleCategory`, `rentalType`, `billingFrequency`, `isActive`, `validOn`, `sortBy` (`code`, `name`, `effectiveFrom`, `effectiveTo`, `dailyRate`, `createdAt`, `updatedAt`) and `sortOrder`.

`validOn=YYYY-MM-DD` returns ratecards whose validity contains that date: `effectiveFrom <= validOn` and (`effectiveTo` is null or `effectiveTo >= validOn`).

### Assignment queries

`GET /ratecard-assignments` supports `page`, `limit`, `clientId`, `rateCardId`, `status`, `validOn`, `sortBy` (`assignedAt`, `validFrom`, `validUntil`, `createdAt`, `updatedAt`) and `sortOrder`. `validOn` applies the same inclusive validity check to the assignment period.

`GET /clients/:id/ratecards` accepts `page`, `limit`, `search`, `status`, `validOn`, `sortBy` and `sortOrder`; `clientId` is taken from the path. It returns each ratecard flattened with an `assignment` object and returns `404 NOT_FOUND` when the client is missing or soft-deleted.

`GET /ratecards/:id/clients` accepts `page`, `limit`, `search`, `status`, `validOn`, `sortBy` and `sortOrder`; `rateCardId` is taken from the path. It returns each client flattened with an `assignment` object and returns `404 NOT_FOUND` when the ratecard is missing.

Both nested endpoints include assignments in every status unless `status` is supplied, so clients and ratecards remain discoverable after unassignment.

### Status bodies

`PATCH /clients/:id/status` and `PATCH /ratecards/:id/status` accept:

```json
{ "isActive": false, "reason": "Superseded by a new contract" }
```

`isActive` is required. `reason` is optional, max 500 characters. Repeating the current status returns `409 CONFLICT`. Status updates use an optimistic `updateMany` guard and return `409 CONFLICT` if a concurrent update wins. Deactivating a ratecard does not cancel its assignments; assignment validity still determines rental applicability.

`DELETE /ratecard-assignments/:id` accepts an optional body:

```json
{ "reason": "Contract ended" }
```

## Examples

Create a client:

```bash
curl -X POST "$BASE_URL/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CORPORATE",
    "name": "Acme Logistics",
    "companyName": "Acme Logistics Pvt Ltd",
    "contactPerson": "Jane Doe",
    "email": "billing@acme.example",
    "phoneNumber": "+919876543210",
    "paymentTermsDays": 30
  }'
```

Create a reusable ratecard:

```bash
curl -X POST "$BASE_URL/ratecards" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Standard B2B 2026",
    "vehicleCategory": "BIKE",
    "rentalType": "B2B",
    "billingFrequency": "MONTHLY",
    "dailyRate": "500.0000",
    "monthlyRate": "10000.0000",
    "securityDeposit": "5000.00",
    "effectiveFrom": "2026-01-01T00:00:00.000Z",
    "effectiveTo": "2026-12-31T00:00:00.000Z"
  }'
```

Assign the ratecard to a client:

```bash
curl -X POST "$BASE_URL/ratecard-assignments" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "<client-id>",
    "rateCardId": "<ratecard-id>",
    "validFrom": "2026-01-01T00:00:00.000Z",
    "validUntil": "2026-12-31T00:00:00.000Z"
  }'
```

Unassign without deleting history:

```bash
curl -X DELETE "$BASE_URL/ratecard-assignments/<assignment-id>" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "reason": "Contract ended" }'
```

## Response and error envelope

```json
{ "success": true, "data": { "assignment": { "...": "..." } } }
```

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "This ratecard is already actively assigned to this client"
  }
}
```

| Status | Code | Typical causes |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Invalid UUID, money, dates, enum, unknown/immutable field, missing pricing source |
| `401` | `UNAUTHORIZED` | Missing or invalid bearer token |
| `403` | `FORBIDDEN` | Role lacks the required permission |
| `404` | `NOT_FOUND` | Client, ratecard or assignment does not exist or client is soft-deleted |
| `409` | `CONFLICT` | Duplicate code, duplicate active assignment, inactive client/ratecard for active assignment, frozen commercial terms, active-rental unassign guard, redundant/concurrent status change |

## Permissions

`ADMIN` and `SUPERVISOR` may manage clients, ratecards and ratecard assignments. `OPERATOR` receives `client:read` only; ratecard pricing and assignments are not visible to `OPERATOR`.

The `ratecardAssignment` resource has `create`, `read`, `update` and `delete` actions. Nested `/clients/:id/ratecards` and `/ratecards/:id/clients` reads require `ratecardAssignment:read`, not plain `ratecard:read`.

## Audit

Client create/update/status changes, ratecard create/update/status changes, and assignment create/update/unassign operations write an audit log row in the same transaction as the mutation. Assignment audit snapshots include client, ratecard, validity, status, assigned/unassigned timestamps and reason.

## Rental pricing integration

No rental creation workflow exists in the codebase yet. `src/services/rental-pricing.ts` exposes `resolveRentalPricing` for the future rental flow.

Pricing must come from exactly one source:

1. **Assigned ratecard**: provide `clientId`, `rateCardId` and optionally `effectiveAt`. Resolution requires an `ACTIVE` assignment for that pair whose validity contains the timestamp, plus an active ratecard whose effective dates contain the timestamp. The result includes `rateCardAssignmentId` and an immutable `rateSnapshot`.
2. **Manual pricing**: provide `manualPricing` with at least `dailyRate`; an assignment is not required. The result records `source: "MANUAL"` and snapshots the supplied rates, currency, deposit and notes.

Providing both sources, or neither, returns `400 VALIDATION_ERROR`. A missing ratecard is never interpreted as a zero price. An unassigned, inactive or out-of-date ratecard returns `409 CONFLICT`.

Rental records can reference `Rental.rateCardAssignmentId`; the restrictive foreign key keeps the assignment history intact. Snapshot the resolved pricing into `Rental.rateSnapshot` at creation time.

## Migration

`prisma/migrations/20261106120000_day11_clients_ratecards/migration.sql` adds the unique `clientCode` and ratecard `code` identifiers, optional ratecard fields and supporting indexes.

`prisma/migrations/20261106130000_ratecard_assignments/migration.sql` introduces the assignment architecture:

- Creates the `RateCardAssignmentStatus` enum and `rate_card_assignments` table.
- Adds `RateCard.vehicleCategory` and `Rental.rateCardAssignmentId`.
- Backfills existing `RateCard.clientId` links into `RateCardAssignment` rows using each ratecard's ID as the assignment ID.
- Adds the partial unique index `rate_card_assignments_active_pair_key` on `(clientId, rateCardId)` where `status = 'ACTIVE'`.
- Drops the old `RateCard.clientId` column, foreign key and indexes.

The partial unique index is database-enforced and intentionally not represented in the Prisma schema. Prisma migrations still report no drift.

## Postman

1. Call `POST /auth/login` and copy the access token.
2. Add a collection-level bearer token or set `Authorization: Bearer <token>` on each request.
3. Create a client with `POST /clients`; capture `data.client.id`.
4. Create a reusable ratecard with `POST /ratecards`; capture `data.rateCard.id`.
5. Assign it with `POST /ratecard-assignments`.
6. Exercise `GET /clients/:id/ratecards`, `GET /ratecards/:id/clients`, `GET /ratecard-assignments?clientId=<id>&status=ACTIVE`, `PATCH /ratecard-assignments/:id`, and `DELETE /ratecard-assignments/:id`.
7. Negative cases: invalid money (`-1`, `0`, `1.23456`), reversed dates, unknown fields, missing token, a role without permission, a duplicate active assignment, an inactive client or ratecard for an active assignment, and unassigning an assignment referenced by an active rental.
