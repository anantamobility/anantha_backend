# History, Trends, Dashboard and Reports

This module adds read-only operational and financial reporting on top of the
existing vehicle, rider, rental, collection, service, inventory and staff
workflows. All endpoints are authenticated and authorized through the existing
RBAC middleware.

## Permissions

| Permission | ADMIN | SUPERVISOR | OPERATOR |
| --- | --- | --- | --- |
| `dashboard:read` | yes | yes | no |
| `report:read` | yes | yes | no |
| `vehicle:history:read` | yes | existing role rules | existing role rules |
| `rider:history:read` | yes | existing role rules | existing role rules |

New permissions are registered in `src/registry/perm.ts` and granted by
`getRolePermissionBuckets`. Dashboard and reports aggregate financial data, so
they are intentionally not granted to `OPERATOR`.

## Vehicle and rider history

```http
GET /vehicles/:id/status-history
GET /riders/:id/status-history
```

Both endpoints support:

| Query | Description |
| --- | --- |
| `page`, `limit` | Pagination. `limit` is capped at 100. |
| `status` | Filter by the resource status enum. |
| `startDate`, `endDate` | Inclusive ISO date-time range on `changedAt`. |
| `sortBy` | `changedAt` (default) or `status`. |
| `sortOrder` | `asc` or `desc` (default). |

Example:

```http
GET /vehicles/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b/status-history?status=DEPLOYED&startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-31T23:59:59.999Z&sortBy=changedAt&sortOrder=asc
```

Newly created vehicles record an initial `IDLE` status-history row so trend
calculations have a reliable baseline. Rider creation already records the
initial `ONBOARDING` row.

## Status trends

Trends are embedded in the dashboard response and use UTC periods:

- `DAILY`: UTC calendar day.
- `WEEKLY`: Monday 00:00 UTC through Sunday 23:59:59.999 UTC.
- `MONTHLY`: UTC calendar month.

The first and last periods are clipped to the requested range. Every response
contains all supported statuses, including zero counts, for stable chart
series.

Historical reconstruction rules:

- With a recorded first transition, the status before the first transition is
  `previousStatus`.
- With no history, the current status is treated as constant since creation.
- A first history row with `previousStatus = null` is used as the creation
  baseline only when it was written at creation time.
- Otherwise, periods before the first reliable transition are reported in the
  `unknown` count instead of being guessed.

## Dashboard

```http
GET /dashboard
GET /dashboard/trends
```

`GET /dashboard/trends` returns the same vehicle and rider trend payloads
without the live counts, financial summaries or deposit balances.

Query parameters:

| Query | Description |
| --- | --- |
| `startDate`, `endDate` | Inclusive UTC range. Defaults to the last 30 days. |
| `groupBy` | `DAILY` (default), `WEEKLY` or `MONTHLY`. |

The response includes:

- `live.vehicles`: total and counts by status.
- `live.riders`: total, counts by status, and PVC/BGV verification counts.
- `trends.vehicle` and `trends.rider`: zero-filled status trend periods.
- `collectionDue`: collection totals plus B2C/B2B splits from
  `RentalCollectionDue` and `Collection`.
- `deposits`: required, received, refunded, deducted and outstanding balances
  derived from deposit transactions.

Collection amounts are based on collections with `receivedAt` in the selected
range. Due amounts are based on `RentalCollectionDue.dueDate` in the selected
range. Outstanding dues are the authoritative source; there is no
double-counting against collections. Overdue amounts come from
`RentalCollectionDue.status = OVERDUE` because `CollectionStatus` has no
overdue state.

Deposit balances are calculated from existing `Deposit` and
`DepositTransaction` records. These endpoints never mutate or refund deposits.

## Reports

All reports share the following query parameters:

| Query | Description |
| --- | --- |
| `page`, `limit` | Pagination. `limit` is capped at 100. |
| `format` | `json` (default) or `csv`. |
| `startDate`, `endDate` | Inclusive UTC range. Defaults to the last 30 days. |
| `search` | Report-specific text search. |
| `hubId`, `clientId`, `riderId`, `vehicleId`, `rentalId`, `spareId` | Optional entity filters where supported. |

Available reports:

| Endpoint | Description |
| --- | --- |
| `GET /reports/collections` | Collections with payer, rental, hub and reconciliation data. |
| `GET /reports/hubs` | Hub activity counts and current inventory value. |
| `GET /reports/b2c` | B2C rentals with due, collected and overdue totals. |
| `GET /reports/b2b` | B2B rentals with due, collected and overdue totals. |
| `GET /reports/riders` | Rider profile, classification and verification summary. |
| `GET /reports/vehicles` | Vehicle status, hub and current assignment. |
| `GET /reports/services` | Service orders, responsibility, downtime and costs. |
| `GET /reports/spares` | Spare stock levels and stock value. |
| `GET /reports/inventory` | Stock balances by spare and hub. |
| `GET /reports/staff` | Staff profile, hub and payout count. |

JSON responses use the standard envelope:

```json
{
  "success": true,
  "data": {
    "report": {
      "name": "collections",
      "columns": [{ "key": "id", "header": "Collection ID" }],
      "filters": { "startDate": "...", "endDate": "..." },
      "rows": [],
      "pagination": {
        "page": 1,
        "limit": 20,
        "total": 0,
        "totalPages": 0,
        "hasNextPage": false,
        "hasPreviousPage": false
      }
    }
  }
}
```

### CSV exports

Add `format=csv` to any report endpoint:

```http
GET /reports/collections?format=csv&startDate=2026-01-01T00:00:00.000Z&endDate=2026-01-31T23:59:59.999Z
```

CSV exports use stable headers, quote every cell, escape embedded quotes, and
are fetched in batches of 100 rows. The response sets
`Content-Type: text/csv; charset=utf-8` and an attachment filename.

## Data limitations

- Historical vehicle status is only as reliable as recorded transitions. Older
  data without a creation-history baseline may show `unknown` for periods
  before the first reliable transition.
- There is no tenant/entity isolation model in this codebase, so report access
  uses the existing RBAC permissions and entity filters rather than inventing
  tenant scoping.
- Service responsibility remains supervisor/admin-approved business data.
  Reports do not auto-charge riders or clients for service orders.
- Current spare stock comes from `InventoryBalance`, not from summing movement
  history.
