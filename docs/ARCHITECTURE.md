# SHAMS — Architecture

SHAMS is a **modular monolith**: one Next.js application and one PostgreSQL database serve the
storefront, the staff dashboard, the point of sale and a background worker. Every channel goes
through the same domain services, so pricing, stock, payments and permissions have exactly one
implementation.

## Stack

| Layer | Choice |
|---|---|
| Web framework | Next.js 16 (App Router, React 19, Turbopack, server actions, `src/proxy.ts`) |
| Language | TypeScript (strict) |
| Database | PostgreSQL 16, Prisma 7 with the `pg` driver adapter (client generated to `src/generated/prisma`) |
| Validation | Zod at every boundary (forms, route handlers, settings, webhooks) |
| Auth | better-auth (email + password, DB sessions, verification and reset flows) |
| Styling | Tailwind CSS v4 with design tokens in `src/app/globals.css` |
| Charts / exports | Recharts; CSV (BOM, formula-injection safe) and XLSX (exceljs, RTL sheets) |
| Jobs | PostgreSQL queue (`FOR UPDATE SKIP LOCKED`), run by `npm run worker` |
| Tests | Vitest (unit + integration against a real database), Playwright (browser acceptance) |

## Source layout

```
src/
  app/
    (store)/          Storefront: home, catalog, product, cart, checkout, account, auth, CMS pages
    admin/            Staff dashboard (login, forbidden, (panel)/… one folder per module), exports
    api/              Auth handler, payment webhooks, analytics collect, prescription files, health, cards
    media/            Public media files (local storage driver)
    sitemap.ts, robots.ts, layout.tsx, not-found.tsx
  proxy.ts            Per-request CSP nonce and security headers
  modules/<domain>/   Business logic. Each module owns its schema (Zod), services and queries
  server/             Cross-cutting: db, env, auth, RBAC, audit, errors, rate limiting, settings,
                      storage, jobs, counters, logger, server-action helpers, storefront context
  components/         UI shared by pages (admin/, store/, rx/)
  ui/                 Design-system primitives (buttons, fields, ActionForm, tables, badges)
  i18n/               Arabic labels and tones for every enum (single place to add English later)
  lib/                Pure helpers: money, Cairo time, optics units, Egypt governorates, validation
prisma/               Schema, migrations, seed
scripts/              worker.ts (job loop), demo-orders.ts (development data)
tests/                Integration tests and fixtures
e2e/                  Playwright acceptance tests
```

### Domain modules

`catalog`, `lenses`, `prescriptions`, `cart`, `checkout` (quote + placement), `pricing` (pure engine),
`promotions`, `loyalty`, `inventory` (ledger), `transfers`, `purchasing`, `suppliers`, `orders`
(state machine), `payments` (provider abstraction), `returns`, `shipping`, `customers`, `reviews`,
`branches`, `staff`, `cms`, `analytics`, `reports`, `notifications`, `settings`, `pos`, `system`.

## Request flow and layering

```
Page (server component) ──reads──► module query            (permission check inside)
Form ─► ActionForm ─► server action ─► requireStaff/requireCustomer ─► module service ─► Prisma tx
Route handler ─► Zod parse ─► module service
Worker ─► job handler ─► module service (system actor)
```

* **UI never contains business rules.** Pages render data and post forms. Server actions only
  authenticate, convert `FormData` (`formToNested`) and call one service. `runAction` turns domain
  errors into safe Arabic messages and logs anything else with an incident id.
* **Services take an `Actor`** (`staff`, `customer` or `system`) and call
  `assertCan(actor, permission, branchId)` themselves, so a direct API call or a crafted form post
  gets the same checks as the UI. Branch-scoped staff are filtered with `branchScope()`.
* **Client components** exist only for interaction (variant picker, lens configurator, checkout
  form, prescription grid, charts, consent banner). Anything they display as a price is a preview;
  the server recomputes it.

## Core flows

### Pricing and checkout
`buildQuote` loads the cart with variants, lens tables, promotions, shipping rate, loyalty and tax
settings, then calls the pure `priceOrder` engine (integer piasters, largest-remainder allocation of
discounts and tax). `placeOrder` runs inside one transaction: lock the customer row, re-quote,
validate coupon, prescription confirmation, COD limits, choose a fulfillment branch that can supply
the whole order, create the order with **snapshots** (names, SKU, prices, cost, lens configuration,
prescription values), reserve stock, redeem promotions and loyalty, convert the cart, write the
timeline and audit entry. An idempotency key makes double submits return the original order.

### Inventory
`inventory_item` is a projection (`onHand`, `reserved`) maintained only by `applyMovement`, which
writes an append-only `inventory_movement` row and updates the projection with a conditional
`UPDATE … WHERE onHand + delta >= reserved` style check. Reservations are separate rows tied to the
order, transfer or POS sale; consumption turns them into `SALE` / `TRANSFER_OUT` movements. Stock is
deducted when a delivery order ships or a pickup/POS order is handed over.

### Orders
`orders/state.ts` is a pure state machine shared by services and the UI (which only renders valid
next steps). `applyTransition` performs side effects in the caller's transaction: stock deduction,
shipment records, offline payment collection, loyalty earn, promotion and loyalty reversal on cancel,
timeline event, audit and customer notification job.

### Payments
Providers implement `PaymentProvider` (create payment → hosted page, verify webhook, fetch status,
refund). Paymob is implemented; a sandbox provider exercises the identical webhook path in
development. The browser's return URL never changes state: only verified webhooks (unique
`(provider, eventId)`) and server-side reconciliation do. Refunds lock the payment and the order and
are capped by database CHECK constraints.

### Point of sale
`placePosSale` builds a transient cart, uses the same quote engine and order builder as the web
checkout, reserves stock at the selling branch and immediately applies the `DELIVERED` transition,
which records the SALE movement, confirms the cash or card-terminal payment and posts loyalty.

### Background jobs
`enqueue()` writes a job row inside the business transaction (outbox style). `scripts/worker.ts`
schedules periodic jobs with slot-based dedupe keys (expire unpaid orders, reconcile payments, mark
abandoned carts) and runs due jobs with retries and backoff. Failed jobs are visible and retryable
from **System health**.

### Analytics
First-party only. The client sends events to `/api/analytics/collect` after consent (configurable);
sessions, attribution and funnels are computed in SQL. Purchases are recorded server-side inside
`placeOrder`. No IPs are stored.

## Localisation
Arabic is the default (`<html lang="ar" dir="rtl">`), prices are EGP formatted with `ar-EG`, dates
use the `Africa/Cairo` zone (report ranges are Cairo business days, DST-aware). All enum labels live
in `src/i18n/labels.ts`; catalog entities carry `nameEn` fields. Adding English means introducing a
locale segment and a second label table, not touching business logic.

## Deployment model
* Web: `npm run build && npm start` behind TLS (any Node host or container).
* Worker: `npm run worker` as a separate long-running process (one or more instances).
* Database: managed PostgreSQL; run `npx prisma migrate deploy` on release.
* Files: `STORAGE_DRIVER=s3` for multi-instance deployments (public and private buckets).
