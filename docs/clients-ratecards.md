# Clients and Ratecards

B2B customer records and reusable commercial ratecards.

## Relationship model

```text
Client 1 --- * Rental --- 1 RateCard (optional reference)
Client 1 --- * ClientContract
```

- A `RateCard` is a reusable pricing configuration. It is **not** owned by a client and has no `clientId`.
- The negotiated B2B price for a client is recorded on `ClientContract`; a ratecard is the general price list.
- A rental references the ratecard used (`Rental.rateCardId`) and freezes the resolved price in `Rental.rateSnapshot`.

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

Clients are soft-deleted through `deletedAt`. Client delete is blocked while the client has open rentals or open invoices.

`GET /clients` supports `page`, `limit`, `search`, `type`, `isActive`, `sortBy` (`name`, `clientCode`, `createdAt`, `updatedAt`) and `sortOrder` (`asc`, `desc`). Search matches code, name, company, contact person, email, phone and tax ID. `GET /clients/:id` includes `_count.rentals`, `_count.riders` and `_count.invoices`.

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

Ratecards are a read-only price catalog: `clientId` is not accepted by create or update. Monetary values may be sent as JSON strings or numbers and are stored as `Decimal`; the API never performs floating-point arithmetic.

`GET /ratecards/:id` includes `_count.rentals`.

### Historical pricing

Once any rental references a ratecard (`Rental.rateCardId`), the ratecard's commercial terms are frozen. `PATCH /ratecards/:id` returns `409 CONFLICT` if the body contains any of `vehicleCategory`, `rentalType`, `billingFrequency`, `dailyRate`, `weeklyRate`, `fortnightlyRate`, `monthlyRate`, `securityDeposit`, `currency`, `effectiveFrom`, `effectiveTo` or `terms`. `name` and `description` remain editable. Create a new ratecard for new pricing instead of rewriting history.

## Endpoints

All routes require a bearer token. `PUT` is a compatibility alias for `PATCH` on client and ratecard update routes.

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/clients` | `client:create` |
| `GET` | `/clients` | `client:read` |
| `GET` | `/clients/:id` | `client:read` |
| `PATCH` / `PUT` | `/clients/:id` | `client:update` |
| `PATCH` | `/clients/:id/status` | `client:status:update` |
| `POST` | `/ratecards` | `ratecard:create` |
| `GET` | `/ratecards` | `ratecard:read` |
| `GET` | `/ratecards/:id` | `ratecard:read` |
| `PATCH` / `PUT` | `/ratecards/:id` | `ratecard:update` |
| `PATCH` | `/ratecards/:id/status` | `ratecard:status:update` |

### Ratecard queries

`GET /ratecards` supports `page`, `limit`, `search`, `vehicleCategory`, `rentalType`, `billingFrequency`, `isActive`, `validOn`, `sortBy` (`code`, `name`, `effectiveFrom`, `effectiveTo`, `dailyRate`, `createdAt`, `updatedAt`) and `sortOrder`.

`validOn=YYYY-MM-DD` returns ratecards whose validity contains that date: `effectiveFrom <= validOn` and (`effectiveTo` is null or `effectiveTo >= validOn`).

### Status bodies

`PATCH /clients/:id/status` and `PATCH /ratecards/:id/status` accept:

```json
{ "isActive": false, "reason": "Superseded by a new contract" }
```

`isActive` is required. `reason` is optional, max 500 characters. Repeating the current status returns `409 CONFLICT`. Status updates use an optimistic `updateMany` guard and return `409 CONFLICT` if a concurrent update wins. Deactivating a ratecard does not affect existing rentals; they keep their snapshot.

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

## Response and error envelope

```json
{ "success": true, "data": { "rateCard": { "...": "..." } } }
```

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Ratecard is not active for the requested date"
  }
}
```

| Status | Code | Typical causes |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Invalid UUID, money, dates, enum, unknown/immutable field, missing pricing source |
| `401` | `UNAUTHORIZED` | Missing or invalid bearer token |
| `403` | `FORBIDDEN` | Role lacks the required permission |
| `404` | `NOT_FOUND` | Client or ratecard does not exist or client is soft-deleted |
| `409` | `CONFLICT` | Duplicate code, frozen commercial terms, redundant/concurrent status change, inactive ratecard for a rental |

## Permissions

`ADMIN` and `SUPERVISOR` may manage clients and ratecards. `OPERATOR` receives `client:read` only; ratecard pricing is not visible to `OPERATOR`.

## Audit

Client create/update/status changes and ratecard create/update/status changes write an audit log row in the same transaction as the mutation.

## Rental pricing integration

`src/services/rental-pricing.ts` exposes `resolveRentalPricing`, used by rental creation.

Pricing must come from exactly one source:

1. **Ratecard**: provide `clientId`, `rateCardId` and optionally `effectiveAt`. The ratecard must be active and its effective window must contain the timestamp. The result includes an immutable `rateSnapshot`.
2. **Manual pricing**: provide `manualPricing` with at least `dailyRate`. The result records `source: "MANUAL"` and snapshots the supplied rates, currency, deposit and notes.

Providing both sources, or neither, returns `400 VALIDATION_ERROR`. A missing ratecard is never interpreted as a zero price. An inactive or out-of-date ratecard returns `409 CONFLICT`.

Snapshot the resolved pricing into `Rental.rateSnapshot` at creation time.

## Postman

1. Call `POST /auth/login` and copy the access token.
2. Add a collection-level bearer token or set `Authorization: Bearer <token>` on each request.
3. Create a client with `POST /clients`; capture `data.client.id`.
4. Create a reusable ratecard with `POST /ratecards`; capture `data.rateCard.id`.
5. Create a rental with `POST /rentals` passing `rateCardId` (or `manualPricing`); confirm `rateSnapshot` is populated.
6. Negative cases: invalid money (`-1`, `0`, `1.23456`), reversed dates, unknown fields, missing token, a role without permission, and an inactive or out-of-date ratecard.
