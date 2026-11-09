# Rentals, Security Deposits and Collections

Day 7 introduces the rental lifecycle, an authoritative security-deposit ledger, and rental collection dues with allocation.

## Relationship model

```text
Client 1 --- * Rental * --- 1 Rider (optional)
                 |
                 +--- * VehicleAssignment --- 1 Vehicle
                 +--- 1 Deposit --- * DepositTransaction
                 +--- * RentalCollectionDue --- * Collection
                 +--- * RentalLedgerEntry
```

- A `Rental` is the operational contract. Pricing is frozen in `rateSnapshot` at creation.
- A rental has at most one security deposit (`Deposit.rentalId` is unique).
- A deposit balance is derived from its transactions; the `Deposit` row stores status and required amount only.
- Rent charges are materialised as `RentalCollectionDue` periods.
- A `Collection` records money received. When cleared it is allocated oldest-first across open dues.
- `RentalLedgerEntry` is an append-only rental-level ledger for charges, collections and adjustments.

## Rental lifecycle

```text
DRAFT -> PENDING_APPROVAL -> ACTIVE -> ON_HOLD -> ACTIVE
  |             |              |          |
  +-------------+--------------+----------+--> COMPLETED / TERMINATED
  |
  +--> CANCELLED
```

Implemented transitions:

| From | Allowed to |
| --- | --- |
| `DRAFT` | `PENDING_APPROVAL`, `ACTIVE`, `CANCELLED` |
| `PENDING_APPROVAL` | `ACTIVE`, `CANCELLED` |
| `ACTIVE` | `ON_HOLD`, `COMPLETED`, `TERMINATED` |
| `ON_HOLD` | `ACTIVE`, `TERMINATED` |
| `COMPLETED`, `TERMINATED`, `CANCELLED` | terminal |

Rentals are created in `DRAFT`. Activation requires an active vehicle assignment and sets `activatedAt`. Closure is allowed only from `ACTIVE` or `ON_HOLD`, sets `endDate`, `closedAt`, `closedById`, `finalOutstandingAmount`, `finalDepositBalance` and `settlementSnapshot`.

## Rental model

| Field | Type | Rules |
| --- | --- | --- |
| `rentalNumber` | string | Auto-generated `RN-XXXXXXXXXX`; unique and immutable |
| `rentalType` | `B2C`, `B2B` | Required |
| `b2cMode` | `AML_RIDER`, `INDIVIDUAL_RIDER` / null | Required for B2C, not allowed for B2B |
| `b2bRiderMgmt` | `CLIENT_MANAGED`, `AML_MANAGED` / null | Required for B2B, not allowed for B2C |
| `clientId` | UUID | Required; active, non-deleted client |
| `riderId` | UUID / null | Required for B2C; must be `ACTIVE` and match the client/classification |
| `hubId` | UUID / null | Optional; must be active |
| `rateCardId`, `manualPricing` | UUID / object | Exactly one pricing source is required |
| `startDate` | ISO date | Required |
| `expectedEndDate` | ISO date / null | Optional; must be later than `startDate` |
| `collectionPeriod` | `WEEKLY`, `EVERY_15_DAYS`, `MONTHLY` | Required |
| `securityDepositAmount` | decimal string | Required, non-negative, at most 2 decimal places |
| `billingFrequency` | `WEEKLY`, `FORTNIGHTLY`, `MONTHLY` / null | Optional; defaults from the ratecard |
| `currency` | string | Optional 3-letter ISO code; defaults from pricing or `INR` |
| `vehicleId` | UUID / null | Optional; if supplied it is assigned immediately and the vehicle must be `IDLE` |

`collectionPeriod` is independent of `billingFrequency`. It controls due generation only.

## Deposit model

| Field | Type | Notes |
| --- | --- | --- |
| `payerType` | `RIDER`, `CLIENT` | Derived: B2C -> `RIDER`, B2B -> `CLIENT` |
| `amountRequired` | decimal | From `securityDepositAmount` |
| `currency` | string | Rental currency |
| `status` | `REQUIRED`, `PENDING_RECEIPT`, `PARTIALLY_RECEIVED`, `RECEIVED`, `PARTIALLY_REFUNDED`, `REFUNDED`, `CLOSED` | Derived from transactions |
| `version` | integer | Optimistic lock |

`DepositTransaction` fields: `type` (`RECEIPT`, `REFUND`, `ADJUSTMENT`), `direction` (`CREDIT`, `DEBIT`), `amount`, `reference`, `reason`, `authorizedById`, `idempotencyKey`, `createdAt`.

Rules:

- Receipts are credits; refunds and debit adjustments reduce the balance.
- A debit may not exceed the current balance.
- `referenceNumber`/`reference` or an explicit `idempotencyKey` deduplicates requests.
- Refunds and adjustments never delete transactions.
- Closing a rental does not automatically refund the remaining deposit; pass `depositRefund` explicitly.
- Payer integrity follows the database check constraints: a `RIDER` deposit stores only `riderId`; a `CLIENT` deposit stores only `clientId`.
- When `securityDepositAmount` is `0`, no deposit row is created. Deposit receipt/refund/adjustment calls for that rental return `409`.

## Migration and seed

Before upgrading an existing database, confirm there is at most one deposit per `rentalId`; the migration adds a unique index on `deposits.rentalId`.

```bash
psql "$DATABASE_URL" -c 'SELECT "rentalId", COUNT(*) FROM deposits WHERE "rentalId" IS NOT NULL GROUP BY "rentalId" HAVING COUNT(*) > 1;'
```

Apply and seed:

```bash
npx prisma migrate deploy
npx tsx src/database/seed.ts
```

## Collection periods and dues

- `WEEKLY` advances by 7 UTC days.
- `EVERY_15_DAYS` advances by 15 UTC days.
- `MONTHLY` advances by UTC calendar month.
- A due is generated when its period start is on or before the requested `throughDate`.
- `dueDate` equals `periodStart`.
- Full periods use `weeklyRate`, `fortnightlyRate` or `monthlyRate` when available. Partial periods fall back to `dailyRate * actual days in period`.
- Due statuses: `PENDING`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`.
- Dues are unique by `(rentalId, periodStart, periodEnd)`; generation is idempotent.
- Rent adjustments mutate the oldest open dues: `CREDIT` reduces `amountDue` and outstanding, `DEBIT` increases them.

## Collection model

| Field | Type | Notes |
| --- | --- | --- |
| `rentalId` | UUID | Required |
| `amount` | decimal | Required, greater than 0 |
| `paymentMethod` | `CASH`, `UPI`, `CARD`, `BANK_TRANSFER`, `CHEQUE`, `OTHER` | Required |
| `referenceNumber` | string / null | Optional; unique per rental |
| `receivedAt` | ISO date | Optional; defaults to now |
| `status` | `PENDING`, `CLEARED` | Optional on create; defaults to `CLEARED` |
| `idempotencyKey` | string | Optional; generated from the reference or a UUID |

Rules:

- Collections are accepted only for `ACTIVE` or `ON_HOLD` rentals.
- A `CLEARED` collection is allocated immediately, oldest due first.
- The amount may not exceed the total outstanding rent.
- Overpayments are rejected with `409 CONFLICT`.
- `PATCH /collections/:id/clear` re-allocates a pending collection; it cannot clear an already cleared collection.
- Payer type is derived: B2C -> `RIDER`, B2B -> `CLIENT`.

## Endpoints

All routes require a bearer token.

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/rentals` | `rental:create` |
| `GET` | `/rentals` | `rental:read` |
| `GET` | `/rentals/:id` | `rental:read` |
| `PATCH` | `/rentals/:id/assign-vehicle` | `rental:assign` |
| `PATCH` | `/rentals/:id/activate` | `rental:activate` |
| `PATCH` | `/rentals/:id/close` | `rental:close` |
| `GET` | `/rentals/:id/deposit` | `deposit:read` |
| `GET` | `/rentals/:id/deposit/ledger` | `deposit:read` |
| `POST` | `/rentals/:id/deposit/receive` | `deposit:receive` |
| `POST` | `/rentals/:id/deposit/refund` | `deposit:refund` |
| `POST` | `/rentals/:id/deposit/adjust` | `deposit:adjust` |
| `GET` | `/rentals/:id/dues` | `collection:read` |
| `POST` | `/rentals/:id/dues/generate` | `collection:due:generate` |
| `GET` | `/rentals/:id/collections` | `collection:read` |
| `POST` | `/collections` | `collection:create` |
| `GET` | `/collections` | `collection:read` |
| `GET` | `/collections/:id` | `collection:read` |
| `PATCH` | `/collections/:id/clear` | `collection:update` |

`OPERATOR` receives read-only rental, deposit and collection access. `SUPERVISOR` and `ADMIN` receive the full workflow.

## Query parameters

`GET /rentals` supports `page`, `limit`, `search`, `rentalType`, `status`, `clientId`, `riderId`, `hubId`, `collectionPeriod`, `sortBy` (`rentalNumber`, `startDate`, `expectedEndDate`, `status`, `createdAt`, `updatedAt`) and `sortOrder`.

`GET /collections` supports `page`, `limit`, `search`, `rentalId`, `clientId`, `riderId`, `status`, `paymentMethod`, `from`, `to`, `sortBy` (`receivedAt`, `amount`, `status`, `createdAt`, `updatedAt`) and `sortOrder`.

`GET /rentals/:id/dues` supports `page`, `limit`, `status`, `sortBy` (`dueDate`, `periodStart`, `periodEnd`, `status`, `createdAt`) and `sortOrder`.

`GET /rentals/:id/collections` supports `page`, `limit`, `status`, `sortBy` and `sortOrder`.

## Business decisions

The following conventions are implemented and intentionally documented because the specification allows more than one interpretation:

1. `collectionPeriod` is separate from `billingFrequency`; only the former drives due generation.
2. `MONTHLY` means a UTC calendar month, not a fixed 30-day period.
3. A due date equals the period start.
4. If a rental closes mid-period, the final period is billed in full.
5. Weekly/fortnightly/monthly rates apply to full periods; otherwise `dailyRate * actual days`.
6. A returned vehicle becomes `IDLE`, unless it has an open service record or `vehicleReturnStatus` is supplied.
7. A B2B rental requires a `CORPORATE` client. A B2C rental requires a rider, and that rider must be `ACTIVE`.
8. Collections require an `ACTIVE` or `ON_HOLD` rental.
9. Overpayments are rejected rather than stored as credit.
10. A collection defaults to `CLEARED` when `status` is omitted.
11. Rental closure never auto-refunds the deposit; a refund must be explicit.
12. Settlement snapshots capture charges, confirmed collections, outstanding amount, deposit balance and vehicle dispositions.

## Examples

Create a B2C rental:

```bash
curl -X POST "$BASE_URL/rentals" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rentalType": "B2C",
    "b2cMode": "AML_RIDER",
    "clientId": "'"$CLIENT_ID"'",
    "riderId": "'"$RIDER_ID"'",
    "vehicleId": "'"$VEHICLE_ID"'",
    "startDate": "2026-01-01T00:00:00.000Z",
    "collectionPeriod": "MONTHLY",
    "securityDepositAmount": "2000.00",
    "manualPricing": {
      "dailyRate": "500.0000",
      "monthlyRate": "12000.0000",
      "currency": "INR"
    }
  }'
```

Receive a deposit:

```bash
curl -X POST "$BASE_URL/rentals/$RENTAL_ID/deposit/receive" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "amount": "2000.00", "reference": "RCPT-2026-0001" }'
```

Activate the rental after assignment:

```bash
curl -X PATCH "$BASE_URL/rentals/$RENTAL_ID/activate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Generate dues through a date:

```bash
curl -X POST "$BASE_URL/rentals/$RENTAL_ID/dues/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "throughDate": "2026-03-01T00:00:00.000Z" }'
```

Record a cleared collection:

```bash
curl -X POST "$BASE_URL/collections" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rentalId": "'"$RENTAL_ID"'",
    "amount": "12000.00",
    "paymentMethod": "UPI",
    "referenceNumber": "UPI-2026-0001"
  }'
```

Close the rental and refund the deposit:

```bash
curl -X PATCH "$BASE_URL/rentals/$RENTAL_ID/close" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "endDate": "2026-03-15T00:00:00.000Z",
    "depositRefund": { "amount": "2000.00", "reference": "REF-2026-0001" }
  }'
```

## Postman verification

1. Run the migration: `npx prisma migrate deploy`.
2. Sync roles and permissions: `npx tsx src/database/seed.ts`.
3. Start the API: `npm run dev`.
4. Log in with `POST /auth/login` and copy the access token into the collection variable `TOKEN`.
5. Set `BASE_URL`, `CLIENT_ID`, `RIDER_ID`, `VEHICLE_ID` and `RENTAL_ID` as collection variables.
6. Run requests in this order: create rental -> assign vehicle (skip if `vehicleId` was supplied) -> activate -> receive deposit -> generate dues -> create collection -> get deposit ledger -> close rental.
7. Verify `201` for creates, `200` for reads and lifecycle updates, and the expected `409` cases (duplicate active assignment, overpayment, closing a draft rental).

## Tests

```bash
npx prisma generate
npx tsc --noEmit
npm test
```

Coverage includes rental creation and validation, vehicle assignment, activation, closure settlement, deposit receipt/refund/adjustment, due generation, collection allocation and RBAC changes.
