# Rider Management

Rider onboarding, classification, lifecycle status, and private document storage.

## Classification

| Field | Values | Rules |
| --- | --- | --- |
| `rentalType` | `B2C`, `B2B` | Required |
| `b2cMode` | `AML_RIDER`, `INDIVIDUAL_RIDER` | Required for B2C; forbidden for B2B |
| `b2bRiderMgmt` | `CLIENT_MANAGED`, `AML_MANAGED` | Required for B2B; forbidden for B2C |
| `clientId` | UUID | Required for B2B; optional otherwise |

Riders are created in `ONBOARDING` status. Status changes stamp `statusChangedAt`.

## Lifecycle Status

Allowed transitions:

- `ONBOARDING` -> `ACTIVE`, `INACTIVE`, `SUSPENDED`, `TERMINATED`
- `ACTIVE` -> `SUSPENDED`, `INACTIVE`, `TERMINATED`
- `SUSPENDED` -> `ACTIVE`, `INACTIVE`, `TERMINATED`
- `INACTIVE` -> `ACTIVE`, `TERMINATED`
- `TERMINATED` -> terminal; create a new rider record to re-onboard

## Documents

Allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.

- Files are stored via the storage adapter under a generated key; the original filename is never used as the storage path.
- Upload size is limited by `STORAGE_MAX_FILE_BYTES` (default 10 MiB).
- Deleting a document soft-deletes metadata (`deletedAt`) and best-effort removes the stored file.
- Downloads require `rider:document:read` and are sent with `Cache-Control: private, no-store` and an attachment disposition.

### Storage configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `STORAGE_DRIVER` | `local` | Active adapter |
| `STORAGE_LOCAL_DIR` | `storage/uploads` | Local adapter root |
| `STORAGE_MAX_FILE_BYTES` | `10485760` | Upload size limit |

Only the `local` adapter is implemented. `STORAGE_DRIVER=s3` fails fast until an S3 adapter is provided.

## Endpoints

All routes require a bearer token.

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/riders` | `rider:create` |
| `GET` | `/riders` | `rider:read` |
| `GET` | `/riders/:id` | `rider:read` |
| `PATCH` / `PUT` | `/riders/:id` | `rider:update` |
| `PATCH` | `/riders/:id/status` | `rider:status:update` |
| `POST` | `/riders/:id/documents` | `rider:document:upload` |
| `GET` | `/riders/:id/documents` | `rider:document:read` |
| `GET` | `/riders/:id/documents/:documentId` | `rider:document:read` |
| `GET` | `/riders/:id/documents/:documentId/download` | `rider:document:read` |
| `DELETE` | `/riders/:id/documents/:documentId` | `rider:document:delete` |
| `DELETE` | `/riders/:id` | `rider:delete` |

`PUT /riders/:id` is retained as a compatibility alias for `PATCH /riders/:id`.

### List filters

`GET /riders` supports `page`, `limit`, `search`, `status`, `rentalType`, `b2cMode`, `b2bRiderMgmt`, `clientId`, `hubId`, `sortBy`, and `sortOrder`.

`GET /riders/:id/documents` supports `page`, `limit`, and `documentType`.

### Document upload

`POST /riders/:id/documents` accepts `multipart/form-data`:

| Field | Required | Notes |
| --- | --- | --- |
| `file` | Yes | Single file, validated by MIME and extension |
| `documentType` | Yes | See document types below |
| `title` | Yes | Human-readable label |
| `issueDate`, `expiryDate` | No | ISO dates |
| `notes` | No | Free text |

Document types: `ID_PROOF`, `ADDRESS_PROOF`, `DRIVING_LICENSE`, `VEHICLE_PERMIT`, `INSURANCE`, `REGISTRATION`, `CONTRACT`, `PVC`, `BGV`, `OTHER`.

## Audit

Rider create/update/status changes and document upload/delete are written to the audit log inside the same transaction as the mutation.
