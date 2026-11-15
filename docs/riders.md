# Rider Management

Rider onboarding, classification, lifecycle status, and document storage.

## Classification

| Field | Values | Rules |
| --- | --- | --- |
| `rentalType` | `B2C`, `B2B` | Required |
| `b2cMode` | `AML_RIDER`, `INDIVIDUAL_RIDER` | Required for B2C; forbidden for B2B |
| `b2bRiderMgmt` | `CLIENT_MANAGED`, `AML_MANAGED` | Required for B2B; forbidden for B2C |
| `clientId` | UUID | Required for B2B; optional otherwise |

Riders are created in `ONBOARDING` status. Status changes stamp `statusChangedAt`.

## Account

`POST /riders` creates the rider and its `User` account in one transaction. The account gets the `RIDER` role, which has no permissions, so it can authenticate but cannot reach any staff endpoint.

- `riderCode` is optional; when omitted it is generated sequentially as `R001`, `R002`, … (`generateRiderId` in `src/utils/idGenerator.ts`). Staff employee codes use the same helper with the `S` prefix.

- `phoneNumber` is required and is the login identifier.
- `email` is optional.
- `password` is required and must pass the password strength rules.
- Name, phone and email are stored once: `fullName` on the rider, phone and email on the account. `PATCH /riders/:id` no longer accepts phone, email or `userId`; change those with `PATCH /users/:id`, which requires `user:update` (ADMIN or SUPERVISOR).
- `userId` is required and unique at the database level, so a rider row cannot exist without an account.

## Profile fields

Identity and compliance data lives on the rider row: `aadharNumber`, `panNumber`, `licenseNumber`, `medicalReportExpiryDate`, `agreementDate`, `policeVerificationValidUpto`, `backgroundVerificationExpiryDate`, `dateOfLastWorkingDay`, `bankName`, `branch`. Existing `bankAccountNumber`, `bankIfsc` and `bankHolderName` are unchanged.

Files are never stored as columns. Uploads go to `Document` (`documentType`, `url`, `documentNumber`, `issueDate`, `expiryDate`), which covers Aadhaar, PAN, licence, medical, agreement, police and BGV copies.

## Lifecycle Status

Allowed transitions:

- `ONBOARDING` -> `ACTIVE`, `INACTIVE`, `SUSPENDED`, `TERMINATED`
- `ACTIVE` -> `SUSPENDED`, `INACTIVE`, `TERMINATED`
- `SUSPENDED` -> `ACTIVE`, `INACTIVE`, `TERMINATED`
- `INACTIVE` -> `ACTIVE`, `TERMINATED`
- `TERMINATED` -> terminal; create a new rider record to re-onboard

## Documents

Allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.

- Files are uploaded to Cloudinary under `anantha_file_storage/riders/<riderId>/` and the returned public URL is stored on the document row.
- Upload size is limited to 10 MiB per file.
- Deleting a document soft-deletes metadata (`deletedAt`) and best-effort removes the Cloudinary asset.
- Downloads require `rider:document:read` and redirect to the stored URL.

### Storage configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` | none | Cloudinary cloud |
| `CLOUDINARY_API_KEY` | none | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | none | Cloudinary API secret |

Documents are public URLs by design. Do not store anything here that must not leak if a link escapes.

## Endpoints

All routes require a bearer token.

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/riders` | `rider:create` |
| `GET` | `/riders` | `rider:read` |
| `GET` | `/riders/:id` | `rider:read` |
| `PATCH` | `/riders/:id` | `rider:update` |
| `PATCH` | `/riders/:id/status` | `rider:status:update` |
| `POST` | `/riders/:id/documents` | `rider:document:upload` |
| `GET` | `/riders/:id/documents` | `rider:document:read` |
| `GET` | `/riders/:id/documents/:documentId` | `rider:document:read` |
| `GET` | `/riders/:id/documents/:documentId/download` | `rider:document:read` |
| `DELETE` | `/riders/:id/documents/:documentId` | `rider:document:delete` |
| `DELETE` | `/riders/:id` | `rider:delete` |

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
