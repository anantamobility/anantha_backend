# Anantha Vehicle Rental Backend

REST API for Anantha's vehicle rental operations: riders, clients, ratecards, rentals, deposits, collections, earnings/settlements, services, spares, inventory, reporting, and administrative user management.

## Stack

- Node.js + Express 5 + TypeScript (ESM, Node16 module resolution)
- Prisma 7 with PostgreSQL
- Redis for login sessions and token revocation
- Zod request validation
- Vitest + Supertest

## Requirements

- Node.js with npm
- PostgreSQL 14+
- Redis 6+

## Setup

```bash
npm install
cp .env.example .env
# Edit .env: set DATABASE_URL, REDIS_URL and strong JWT secrets.
npx prisma migrate deploy
npm run seed        # permissions, roles, default admin
npm run seed:demo   # optional idempotent demo data
npm run dev
```

`npm run seed` logs in with `1234567890 / supersecret123` unless you change the seed. Change that password immediately outside local development.
`npm run seed:demo` additionally creates `9000000000 / DemoPassword123` (override with `DEMO_SEED_PASSWORD`) plus two hubs, clients, ratecards, riders, vehicles and hub-scoped staff users.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start with `tsx` in watch mode. |
| `npm run build` | Regenerate the Prisma client and compile to `dist/`. |
| `npm start` | Run the compiled server (`dist/server.js`). |
| `npm test` | Run the unit/HTTP suite with Prisma mocked. |
| `npm run test:watch` | Run the unit suite in watch mode. |
| `npm run test:integration` | Run real-PostgreSQL integration tests against the isolated test schema. |
| `npm run seed` | Upsert permissions, roles and the default admin. |
| `npm run seed:demo` | Seed RBAC, then upsert demo operational data. |

## Integration tests

Integration tests do not mock Prisma. They run sequentially against a separate schema:

```bash
TEST_DATABASE_URL='postgresql://user:password@localhost:5432/your_db?schema=anantha_test' \
  npm run test:integration
```

When `TEST_DATABASE_URL` is not set, the suite derives the URL from `DATABASE_URL` and forces `schema=anantha_test`. The runner creates the schema when needed, applies all migrations, then **truncates every table in that schema between test files**. Never point it at a schema containing data you need to keep. Redis is replaced with an in-memory mock for this suite.

## API modules

Routers are mounted in `src/app.ts`:

- `/auth` - signup, login, refresh, logout, change-password, admin reset-password
- `/users` - user CRUD, role/status changes, session revocation
- `/audit-logs` - audit log read API
- `/hubs`, `/staff`, `/vehicles`, `/riders`, `/clients`, `/ratecards`
- `/rentals`, `/deposits`, `/collections`, `/earnings`, `/settlements`, `/payouts`
- `/services`, `/spares`, `/inventory`, `/dashboard`, `/reports`

Detailed domain documentation lives in [`docs/`](docs). Start with:

- [`docs/users-security.md`](docs/users-security.md) - authentication, user management, RBAC/PBAC, hub scoping, password reset, soft deletes, audit logging
- [`docs/clients-ratecards.md`](docs/clients-ratecards.md)
- [`docs/rentals-collections.md`](docs/rentals-collections.md)
- [`docs/riders.md`](docs/riders.md)
- [`docs/services-inventory.md`](docs/services-inventory.md)
- [`docs/history-trends-dashboard-reports.md`](docs/history-trends-dashboard-reports.md)

## Security notes

- Passwords are hashed with bcrypt; API responses never include password hashes.
- Password reset tokens are random, single-use, stored only as SHA-256 hashes, and revoked on use or replacement.
- Forgot-password always returns a generic response to prevent account enumeration.
- Login and token verification reject deleted or non-`ACTIVE` users.
- User lifecycle guards prevent self-demotion, self-deactivation, self-deletion, and removal of the last active administrator.
- Sensitive mutations write audit rows in the same database transaction as the change.
- Authorization is deny-by-default through the permission registry; resource policies add record-level checks.
- Hub-scoped non-admin users can only access records in their assigned hub. Administrators bypass hub scoping.

See [`docs/users-security.md`](docs/users-security.md) for endpoint-level details and environment settings.
