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
  i18n/               locale/theme config, translator, English catalog (messages/en.json), enum labels and tones
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
Arabic is the default (`<html lang="ar" dir="rtl">`) and English is the second locale
(`lang="en" dir="ltr"`). The visitor's choice is the `shams_locale` cookie; there are no locale URL
segments.

* **Interface text** uses the Arabic source string as the key (gettext style): `t("أضف إلى السلة")`.
  Server components get `t` from `getT()`, client components from `useT()`. A missing translation
  falls back to Arabic. `t.message()` translates messages built elsewhere (domain errors, Zod
  issues, stored order events) by matching the catalog's `{0}` templates.
* **Formatting** goes through `t.money`, `t.number`, `t.percent` and `t.date` (`ar-EG` / `en-EG`,
  `Africa/Cairo`).
* **Database content** has optional `…En` twins (`name`/`nameEn`, `description`/`descriptionEn`,
  `blocks`/`blocksEn`…). Queries that feed pages pass rows through `localizeContent(rows, locale)`,
  which swaps in the filled English values. Filters keep the stored Arabic value; only labels change.
* **Catalog upkeep:** `node scripts/i18n-extract.mjs` lists every Arabic string in `src/`
  (`--missing` prints untranslated ones, `--prune` drops stale entries); `src/i18n/i18n.test.ts`
  fails CI when a string has no English translation or a placeholder is lost.
* **Layout** uses logical utilities (`ms-`, `pe-`, `start-`, `border-e`) so the same markup works in
  both directions; direction-specific transforms use the `rtl:`/`ltr:` variants.

Dark mode: the `shams_theme` cookie (`system`, `light`, `dark`) is rendered as `data-theme` on
`<html>`. Colours are CSS tokens (`--color-surface`, `--color-ink`, …) redefined for dark mode in
`globals.css`, both for the explicit choice and for `prefers-color-scheme` when set to system.
`--color-night`/`--color-on-night` stay dark in both themes for the hero, sidebar and login panel.

## Deployment model
* Web: `npm run build && npm start` behind TLS (any Node host or container).
* Worker: `npm run worker` as a separate long-running process (one or more instances).
* Database: managed PostgreSQL; run `npx prisma migrate deploy` on release.
* Files: `STORAGE_DRIVER=s3` for multi-instance deployments (public and private buckets).
