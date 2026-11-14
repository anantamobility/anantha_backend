# Dashboard and Reports

This module adds read-only operational and financial reporting on top of the
existing vehicle, rider, rental, collection, service, inventory and staff
workflows. All endpoints are authenticated and authorized through the existing
RBAC middleware.

Status history time-series trends were removed. Vehicle, rider and service
status mutations stamp `statusChangedAt` on the record instead of appending
history rows.

## Permissions

| Permission | ADMIN | SUPERVISOR | OPERATOR |
| --- | --- | --- | --- |
| `dashboard:read` | yes | yes | no |
| `report:read` | yes | yes | no |

New permissions are registered in `src/registry/perm.ts` and granted by
`getRolePermissionBuckets`. Dashboard and reports aggregate financial data, so
they are intentionally not granted to `OPERATOR`.

## Dashboard

```http
GET /dashboard
```

Query parameters:

| Query | Description |
| --- | --- |
| `startDate`, `endDate` | Inclusive UTC range. Defaults to the last 30 days. |
| `groupBy` | Accepted for compatibility; live aggregates do not build trend periods. |

The response includes:

- `live.vehicles`: total and counts by status.
- `live.riders`: total and counts by status.
- `collectionDue`: collection totals plus B2C/B2B splits from
  `RentalCollectionDue` and `Collection`.
- `deposits`: required, received, refunded, deducted and outstanding balances
  derived from deposit transactions.

Collection amounts are based on collections with `receivedAt` in the selected
range. Due amounts are based on `RentalCollectionDue.dueDate` in the selected
range.

## Reports

Authenticated `GET /reports/*` endpoints return tabular JSON (or CSV via
`format=csv`) for riders, vehicles, hubs, staff, rentals, collections,
services, spares and inventory. Date windows use the shared
`resolveTrendRange` helper.
