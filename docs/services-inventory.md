# Service Orders, Replacements and Spare Inventory

This module covers vehicle service orders, vehicle downtime, rental pauses, replacement vehicles, responsibility approvals, service charges, spare parts and per-hub stock balances.

## Relationship model

```text
Service * --- 1 Vehicle
        * --- 0..1 Rental --- 0..1 RentalPause
        * --- * ServiceCharge
        * --- * ServiceSpare --- 1 Spare
        * --- * ServiceStatusHistory
        * --- * ServiceResponsibilityApproval
        * --- * ReplacementAssignment --- 1 original/replacement Vehicle

Spare 1 --- * InventoryBalance --- 1 Hub
      1 --- * InventoryMovement
```

- `Service.serviceNumber` is generated as `SVC-XXXXXXXXXXXX` and is immutable.
- A service may be attached to a rental only when the vehicle is actively assigned to that rental.
- Every status change writes a `ServiceStatusHistory` row in the same transaction.
- `Service.version` guards all service mutations; stale writes return `409 CONFLICT`.
- Charges, spare lines, replacement assignments, responsibility approvals and status history are included in `GET /services/:id`.

## Service lifecycle

```text
REPORTED ------> IN_PROGRESS <--> AWAITING_PARTS
   |                 |                  |
   +-------> CANCELLED <----------------+
                     |
                     +--> COMPLETED --> CLOSED
```

| From | Allowed to |
| --- | --- |
| `REPORTED` | `IN_PROGRESS`, `CANCELLED` |
| `APPROVED` | `IN_PROGRESS`, `CANCELLED` (reserved; no endpoint currently sets `APPROVED`) |
| `IN_PROGRESS` | `AWAITING_PARTS`, `COMPLETED`, `CANCELLED` |
| `AWAITING_PARTS` | `IN_PROGRESS`, `COMPLETED`, `CANCELLED` |
| `COMPLETED` | `CLOSED` |
| `CLOSED`, `CANCELLED` | terminal |

`AWAITING_PARTS` and `RESUME` do not touch vehicle status, downtime timestamps or rental pauses. Downtime and pause begin on `start` and end on `complete` or `cancel`.

## Service model

| Field | Type | Notes |
| --- | --- | --- |
| `serviceType` | `TECHNICAL`, `PREVENTIVE`, `ACCIDENT`, `RIDER_DAMAGE`, `OTHER` | Required |
| `vehicleId` | UUID | Required; active, non-deleted, not `RETIRED`/`OUT_OF_SERVICE` |
| `rentalId` | UUID / null | Optional; rental must not be terminal and must have an active assignment for the vehicle |
| `status` | `ServiceStatus` | Defaults to `REPORTED` |
| `responsibleParty` | `AML`, `RIDER`, `CLIENT`, `THIRD_PARTY`, `INSURANCE`, `UNKNOWN` | Defaults to `UNKNOWN` |
| `reportedAt` | timestamp | Optional; defaults to now |
| `startedAt`, `completedAt`, `closedAt`, `cancelledAt` | timestamp / null | Set by lifecycle actions |
| `downtimeStart`, `downtimeEnd` | timestamp / null | `startedAt`, then `completedAt`/`cancelledAt` |
| `downtimeReason` | string / null | Updated by `start` when supplied |
| `previousVehicleStatus` | `VehicleStatus` / null | Captured when the service starts; restored afterwards |
| `replacementVehicleId` | UUID / null | Set while a replacement is active |

List filters: `page`, `limit`, `search`, `status`, `serviceType`, `vehicleId`, `rentalId`, `responsibleParty`, `from`, `to`, `sortBy`, `sortOrder`.

## Vehicle downtime and rental pauses

- `PATCH /services/:id/start` moves the vehicle to `IN_SERVICE`, records `downtimeStart`, and captures `previousVehicleStatus`.
- A vehicle may have only one active downtime. A second start for the same vehicle returns `409` until the existing service is completed or cancelled.
- If the service has a rental and the rental is `ACTIVE`, starting the service pauses the rental:
  - The rental becomes `ON_HOLD`.
  - A `RentalPause` row is created with `previousRentalStatus`, `pausedAt`, and the service reference.
  - If the rental is already `ON_HOLD`, a pause row is still created but the status is left unchanged.
- Completing or cancelling the service resumes the pause:
  - `RentalPause.status` becomes `RESUMED` with `resumedAt`.
  - The rental returns to `ACTIVE` only when it was paused from `ACTIVE` and is still `ON_HOLD`.
- Vehicle restoration happens on complete/cancel and is skipped while another service downtime is active for the same vehicle. `IN_SERVICE`, `UNDER_REPAIR` and `OUT_OF_SERVICE` restore to `IDLE`; other captured statuses are restored directly.
- Terminal rentals are never paused. Pausing is applied only to `ACTIVE` or `ON_HOLD` rentals.

Pause-aware billing:

- `calculateDueAmountWithPauses` is exported from `src/services/rental-schedule.ts`.
- Newly generated rental dues subtract active/resumed pause intervals from the billing window and prorate partial periods.
- Existing `RentalCollectionDue` rows are never rewritten; the pause only affects dues generated afterwards.
- A fully paused window produces `0`.

## Replacement vehicles

`POST /services/:id/replacement`

| Field | Type | Notes |
| --- | --- | --- |
| `replacementVehicleId` | UUID | Required; must be `IDLE`, active, non-deleted, and different from the vehicle under service |
| `replacementRentalId` | UUID / null | Optional; must differ from the original rental |
| `riderId`, `clientId` | UUID / null | Optional; defaults from the replacement rental or original rental |

Rules:

- A service can have at most one active replacement assignment.
- A replacement vehicle can have at most one active replacement assignment.
- The replacement vehicle moves to `DEPLOYED`; the service's `replacementVehicleId` is set.
- `riderId`/`clientId` are inferred in this order: explicit input, replacement rental, original rental.

`POST /services/:id/replacement/return`

- Requires an active replacement assignment.
- `returnedAt` may not be before `assignedAt`.
- The assignment becomes `COMPLETED`; the replacement vehicle returns to `IDLE` only if it is still `DEPLOYED`.
- The service's `replacementVehicleId` is cleared when it still points at the returned vehicle.
- When `replacementRentalId` is present, a `REPLACEMENT_RENT` charge is created using the replacement rental's collection period and rates over `[assignedAt, returnedAt]`.
- The replacement charge is idempotent via `replacement-charge:${assignment.id}`. A zero-amount window creates no charge.

## Responsibility approval

`POST /services/:id/approve-responsibility` is restricted to `ADMIN` and `SUPERVISOR` users (the `service:approve-responsibility` permission alone is not sufficient).

| Field | Type | Notes |
| --- | --- | --- |
| `responsibility` | `ResponsibleParty` | Required |
| `investigationNotes` | string | Required |
| `evidence` | object / null | Optional JSON |
| `reason` | string | Optional |

- The service must not be terminal.
- An immutable `ServiceResponsibilityApproval` row records the previous and new responsibility.
- Existing charges whose status is not `COLLECTED` or `WAIVED` are reallocated using the new responsibility. `COLLECTED` and `WAIVED` charges are left untouched.

Charge allocation:

| Responsibility | `billableAmount` | `status` |
| --- | --- | --- |
| `UNKNOWN` | `0` | `PENDING` |
| `AML` | `0` | `BILLED` |
| `RIDER`, `CLIENT`, `THIRD_PARTY`, `INSURANCE` | full `costAmount` | `BILLED` |

Charge statuses: `PENDING`, `BILLED`, `WAIVED`, `COLLECTED`.

## Service charges

`POST /services/:id/charges`

| Field | Type | Notes |
| --- | --- | --- |
| `chargeType` | `LABOR`, `SPARE_PARTS`, `OTHER_COST`, `DOWNTIME_RENT`, `REPLACEMENT_RENT` | Required |
| `costAmount` | decimal | Required, positive, at most 2 decimal places |
| `description` | string | Optional |
| `idempotencyKey` | string | Optional; duplicate keys return the existing charge with `duplicate: true` |

- Terminal services reject new charges.
- The charge is allocated immediately using the service's current `responsibleParty`.
- Spare consumption and replacement returns create charges automatically with deterministic keys.

## Spares

`POST /spares`, `GET /spares`, `GET /spares/:id`, `PATCH /spares/:id`, `PATCH /spares/:id/status`

| Field | Type | Notes |
| --- | --- | --- |
| `sku` | string | Required; stored as `partNumber`; unique; `A-Z a-z 0-9 . _ -` |
| `name` | string | Required |
| `category`, `description` | string / null | Optional |
| `unitOfMeasure` | string | Optional; defaults to `UNIT` |
| `purchasePrice` | decimal / null | Optional, 4 decimal places |
| `unitCost` | decimal | Required on create, 4 decimal places |
| `minimumStock` | integer | Optional; defaults to `0` |
| `currency` | 3-letter code | Optional; defaults to `INR`; uppercased |
| `isActive` | boolean | Defaults to `true`; toggled via the status endpoint |

Responses expose both `partNumber` and the `sku` alias. Inactive spares are rejected for stock-in/consumption operations by the service workflow; historical movements remain readable.

List filters: `page`, `limit`, `search`, `category`, `isActive`, `sortBy` (`sku`, `name`, `category`, `minimumStock`, `createdAt`, `updatedAt`), `sortOrder`.

## Inventory ledger

`InventoryBalance` is the cached authoritative per-`(spareId, hubId)` quantity. `InventoryMovement` is the append-only ledger with `quantityDelta`. Both are updated atomically in the same transaction.

Movement types:

| Type | Direction |
| --- | --- |
| `OPENING_STOCK` | IN |
| `PURCHASE_IN` | IN |
| `SERVICE_RETURN` | IN |
| `SERVICE_CONSUMPTION` | OUT |
| `DAMAGED_STOCK` | OUT |
| `MANUAL_ADJUSTMENT` | IN or OUT (`direction` required) |

Rules:

- `quantity` is always a positive integer.
- Inbound movements upsert the balance; outbound movements use a conditional decrement and return `409` when `onHand` is insufficient.
- Hub must exist and be active.
- Every movement shares the operation's transaction with its audit entry.
- `GET /inventory/balances/:spareId/:hubId` returns both `cachedOnHand` and `derivedBalance` (sum of `quantityDelta`).
- Low stock means `onHand <= spare.minimumStock`; `GET /inventory/low-stock` and `balances?lowStock=true` support it.

### Service consumption and returns

`POST /inventory/consume`

| Field | Notes |
| --- | --- |
| `serviceId`, `spareId` | Required |
| `hubId` | Optional; defaults to the vehicle's hub, error if neither exists |
| `quantity`, `unitCost`, `notes` | `unitCost` defaults to the spare's current unit cost |
| `idempotencyKey` | Optional; defaults to `service-consume:${serviceId}:${spareId}:${quantity}` |

- Allowed only for services in `REPORTED`, `APPROVED`, `IN_PROGRESS` or `AWAITING_PARTS`.
- Creates an OUT `SERVICE_CONSUMPTION` movement, a `ServiceSpare` line, and a `SPARE_PARTS` charge (`lineCost = unitCost × quantity`, 2 decimal places).
- The movement key is `movement:${idempotencyKey}` and the charge key is `spare-charge:${serviceSpare.id}`.
- Repeating the same consumption key returns the existing line with `duplicate: true` and does not deduct stock again.

`POST /inventory/return`

- Rejected for `CLOSED` or `CANCELLED` services.
- Stores a compensating `ServiceSpare` with negative `quantity` and negative `lineCost`, and an IN `SERVICE_RETURN` movement.
- Default key: `service-return:${serviceId}:${spareId}:${quantity}`; movement key is `movement:${idempotencyKey}`.
- Returns are not automatically re-reversed on existing charges; they are represented by the negative spare line.

### Other stock operations

| Endpoint | Behavior |
| --- | --- |
| `POST /inventory/opening-stock` | IN `OPENING_STOCK`; default key `opening-stock:${spareId}:${hubId}` |
| `POST /inventory/stock-in` | IN `PURCHASE_IN`; optional `referenceType`/`referenceId` |
| `POST /inventory/adjust` | `MANUAL_ADJUSTMENT` with explicit `direction` and required `reason` |
| `POST /inventory/damage` | OUT `DAMAGED_STOCK`; required `reason` |

## Endpoints

All routes require a bearer token.

### Services

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/services` | `service:create` |
| `GET` | `/services` | `service:read` |
| `GET` | `/services/:id` | `service:read` |
| `PATCH` | `/services/:id` | `service:update` |
| `PATCH` | `/services/:id/start` | `service:start` |
| `PATCH` | `/services/:id/awaiting-parts` | `service:await-parts` |
| `PATCH` | `/services/:id/resume` | `service:resume` |
| `PATCH` | `/services/:id/complete` | `service:complete` |
| `PATCH` | `/services/:id/close` | `service:close` |
| `PATCH` | `/services/:id/cancel` | `service:cancel` |
| `POST` | `/services/:id/approve-responsibility` | `service:approve-responsibility` |
| `POST` | `/services/:id/replacement` | `service:assign-replacement` |
| `POST` | `/services/:id/replacement/return` | `service:return-replacement` |
| `POST` | `/services/:id/charges` | `service:charge:manage` |

### Spares

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/spares` | `spare:create` |
| `GET` | `/spares` | `spare:read` |
| `GET` | `/spares/:id` | `spare:read` |
| `PATCH` | `/spares/:id` | `spare:update` |
| `PATCH` | `/spares/:id/status` | `spare:status:update` |

### Inventory

| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/inventory/balances` | `inventory:read` |
| `GET` | `/inventory/balances/:spareId/:hubId` | `inventory:read` |
| `GET` | `/inventory/movements` | `inventory:read` |
| `GET` | `/inventory/low-stock` | `inventory:read` |
| `GET` | `/inventory/spares/:spareId/movements` | `inventory:read` |
| `POST` | `/inventory/opening-stock` | `inventory:opening-stock` |
| `POST` | `/inventory/stock-in` | `inventory:stock-in` |
| `POST` | `/inventory/adjust` | `inventory:adjust` |
| `POST` | `/inventory/consume` | `inventory:consume` |
| `POST` | `/inventory/return` | `inventory:return` |
| `POST` | `/inventory/damage` | `inventory:damage` |

Role defaults:

- `ADMIN` receives every action.
- `SUPERVISOR` receives the full service, spare and inventory workflow.
- `OPERATOR` receives `service:read`, `spare:read` and `inventory:read` only.

Movement list filters: `page`, `limit`, `spareId`, `hubId`, `serviceId`, `movementType`, `from`, `to`, `sortBy` (`movedAt`, `quantity`, `createdAt`), `sortOrder`.

## Migration

Schema changes ship in `prisma/migrations/20261112000000_service_inventory_modules`.

```bash
npx prisma migrate deploy
npx prisma migrate status
```

The migration adds the service, spare, inventory, rental-pause and replacement tables plus the new enums and indexes. Existing rows are not backfilled; opening balances should be recorded through `POST /inventory/opening-stock`.

## Audit

The following actions are written inside the mutation transaction:

- Service: create, update, start, await-parts, resume, complete, close, cancel, approve responsibility, assign/return replacement, charge.
- Inventory: opening stock, stock-in, adjustment, damage, spare consumption and return.
- Rental: pause/resume.
- Vehicle: status changes caused by service or replacement operations.
- Spare: create, update, status change.
