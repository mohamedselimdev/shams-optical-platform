# شمس | SHAMS — Optical retail platform

Commerce and operations platform for an Egyptian optical chain: Arabic-first (RTL) storefront with a
prescription-lens configurator, multi-branch inventory, orders, payments, returns, CRM, purchasing,
promotions and loyalty, staff RBAC, CMS, first-party analytics, reports and a point of sale, all in
one Next.js + PostgreSQL modular monolith.

* [Architecture](docs/ARCHITECTURE.md)
* [Database](docs/DATABASE.md)
* [Security](docs/SECURITY.md)
* [Implementation status](docs/IMPLEMENTATION_STATUS.md) — what is complete, partial, needs credentials or is planned

## Requirements

* Node.js 22+
* PostgreSQL 16 (a local server or `docker run -p 5432:5432 -e POSTGRES_USER=shams -e POSTGRES_PASSWORD=shams postgres:16`)

## Getting started

```bash
cp .env.example .env            # then set BETTER_AUTH_SECRET, IP_HASH_SALT and SEED_OWNER_PASSWORD
npm install                     # also generates the Prisma client
npx prisma migrate deploy       # create the schema
npm run db:seed                 # roles, permissions, branches, settings, sample catalog and lenses
npm run db:demo                 # optional: sample orders for dashboards and reports
npm run dev                     # http://localhost:3000
npm run worker                  # second terminal: background jobs (notifications, expiry, reconciliation)
```

* Storefront: `http://localhost:3000`
* Staff dashboard: `http://localhost:3000/admin` — sign in as `owner@shams.example` with
  `SEED_OWNER_PASSWORD` (the seed prints the login; if the variable was empty it generates a random password).
* Card and wallet payments use the **sandbox gateway** in development (`PAYMENT_SANDBOX_ENABLED=true`),
  which drives the same signed-webhook path as Paymob.
* Development emails are written to `storage/dev-mail/`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server, production build, production server |
| `npm run worker` | Background job worker (run alongside the web server in every environment) |
| `npm run lint` / `typecheck` | ESLint and TypeScript |
| `npm test` | Vitest unit and integration tests (needs `TEST_DATABASE_URL`; that database's schema is dropped on each run) |
| `npm run test:e2e` | Playwright acceptance tests against a running, seeded app (`PLAYWRIGHT_BASE_URL`, `E2E_STAFF_PASSWORD`) |
| `npm run db:seed` / `db:reset` / `db:demo` | Seed, reset (development only), demo orders |

## Production

1. Provision PostgreSQL, set every variable in `.env.example` (see the checklist in
   [SECURITY.md](docs/SECURITY.md#production-checklist)), and set `PAYMENT_SANDBOX_ENABLED=false`.
2. `npm ci && npx prisma migrate deploy && npm run build`
3. Run `npm start` behind TLS and `npm run worker` as a separate process.
4. Register `https://<host>/api/webhooks/payments/paymob` as the Paymob callback.

Integrations that need credentials (Paymob, Resend email, S3 storage, carrier APIs) are reported as
REQUIRES_EXTERNAL_CONFIG on **Dashboard → Integrations** until configured.

## Conventions

* Business logic lives in `src/modules/*`; pages and components only render and submit.
* Money is integer piasters; optics are hundredths of a diopter. See `src/lib`.
* User-facing labels are centralised in `src/i18n/labels.ts`.
