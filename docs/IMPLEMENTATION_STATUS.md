# SHAMS — Implementation Status

Legend: **COMPLETE** (implemented, wired end-to-end in the UI, tested) · **PARTIAL** (works, with listed
gaps) · **REQUIRES_EXTERNAL_CONFIG** (real adapter exists; needs credentials and has not been verified
against the live service) · **BLOCKED** · **PLANNED** (not built)

_Last updated: 2026-10-04_

## Platform

| Area | Status | Notes |
|---|---|---|
| Database schema, constraints, append-only ledgers | COMPLETE | 73 models, CHECK constraints, partial unique indexes, triggers block UPDATE/DELETE on movements, loyalty, audit, order events, price history. See DATABASE.md |
| Money / tax engine | COMPLETE | Integer piasters, VAT-inclusive (configurable), largest-remainder allocation; unit tested |
| Authentication (staff + customers) | COMPLETE | better-auth: scrypt, DB sessions, secure cookies, rate limits, verification, reset without account enumeration, change password |
| RBAC (server-enforced, branch-scoped) | COMPLETE | 52 permissions, 11 system roles, custom roles, escalation prevention; enforced in services; tested |
| Staff two-factor authentication | PLANNED | |
| Security headers / CSP | COMPLETE | Per-request nonce CSP, HSTS (prod), frame denial, nosniff |
| Audit log | COMPLETE | Append-only; admin viewer with filters |
| Background jobs (Postgres queue + worker) | COMPLETE | Outbox style, SKIP LOCKED, retries, failed-job retry from System health |
| System health page | COMPLETE | DB, job queue, integrations, configuration warnings |
| CI | COMPLETE | GitHub Actions: Postgres service, migrate, lint, typecheck, Vitest, build, seed, Playwright. Not yet run on GitHub (no remote repository yet) |

## Commerce

| Area | Status | Notes |
|---|---|---|
| Storefront (home, categories, brands, collections, search & filters, product page, compare, recently viewed, CMS pages, store locator, SEO, sitemap, JSON-LD) | COMPLETE | Arabic RTL; branch availability shown as levels only |
| Lens configurator | COMPLETE | Type × index price matrix, options, compatibility and power limits; server-authoritative |
| Prescriptions (saved, entered, uploaded) | COMPLETE | Private; staff views audited; verification gate before lens preparation. Prescription lenses require a customer account by design |
| Cart (guest + signed-in, merge on login, coupons) | COMPLETE | |
| Checkout (delivery/pickup, governorate shipping, COD limits, loyalty, Rx confirmation, idempotency) | COMPLETE | Full server revalidation; pickup only from branches that can supply the whole cart |
| Customer account (orders, addresses, prescriptions, returns, loyalty, wishlist, profile) | COMPLETE | |
| Guest order tracking | COMPLETE | Order number + phone, rate limited |
| Order state machine, timeline, staff processing | COMPLETE | Stock deduction on ship/handover, collection of COD/branch payments, loyalty, reversals, notifications |
| Split shipments across branches | PLANNED | Each order is fulfilled from one branch |
| Payments abstraction, webhooks, idempotency, refunds, reconciliation | COMPLETE | Verified with the sandbox gateway, which uses the real webhook path |
| Paymob (cards, wallets) | REQUIRES_EXTERNAL_CONFIG | Intention API + HMAC verification implemented; not verified against live credentials |
| Returns | COMPLETE | Customer request, staff approval, receipt with restock or damage ledger entries, refunds |
| Exchanges | PARTIAL | Recorded on the return; the replacement order is created manually |
| Promotions (coupons, automatic, %, fixed, free shipping, scopes, limits, stacking) | COMPLETE | Tested |
| Loyalty | COMPLETE | Earn on delivery, redeem at checkout, reversals, manual adjustments (audited) |
| Reviews with moderation | COMPLETE | Verified-purchase flag |
| Abandoned-cart detection | PARTIAL | Carts are marked abandoned and reported; recovery emails are PLANNED |

## Operations

| Area | Status | Notes |
|---|---|---|
| Branches | COMPLETE | |
| Catalog admin (products, variants, images, brands, categories, collections, price history) | COMPLETE | |
| Inventory ledger, reservations, adjustments, oversell protection | COMPLETE | Concurrency test proves no oversell |
| Stock transfers (Draft → Approved → In transit → Received) | COMPLETE | Reservation on approval, discrepancy reasons |
| Suppliers, purchase orders, goods receipts | COMPLETE | Partial receipts, moving-average cost |
| CRM (customers, notes, order and prescription history, loyalty) | COMPLETE | Customer tags and segments are PLANNED |
| Staff and roles management | COMPLETE | |
| CMS (pages with typed blocks, banners, navigation, announcements, home sections) | COMPLETE | No raw HTML |
| Settings (store, tax, checkout, loyalty, returns, analytics) | COMPLETE | Validated with Zod |
| Point of sale | PARTIAL | Walk-in sales with cash (change) or card terminal, customer lookup/creation, promotions and loyalty, receipt, daily summary. Gaps: lens/Rx jobs at the counter, till sessions and cash-drawer reconciliation |
| Notifications log | COMPLETE | Email + in-app; SMS recorded as SKIPPED |

## Analytics and reports

| Area | Status | Notes |
|---|---|---|
| First-party analytics (consent, sessions, events, attribution, funnel) | COMPLETE | No IPs stored; purchases recorded server-side |
| Admin dashboard | COMPLETE | KPIs, sales chart, attention lists |
| Reports (sales, branches, products/brands/categories with margin, payments, stock valuation, low/dead stock, purchasing, returns, discounts, customers, loyalty, attribution) | COMPLETE | Cairo business days |
| CSV / XLSX exports | COMPLETE | Formula-injection safe, permission-checked, audited |
| GA4 forwarding | PLANNED | |

## Integrations

| Integration | Status | Notes |
|---|---|---|
| Email (Resend) | REQUIRES_EXTERNAL_CONFIG | Development writes to `storage/dev-mail`; production needs `RESEND_API_KEY` |
| File storage S3 / R2 | REQUIRES_EXTERNAL_CONFIG | Local driver COMPLETE for development |
| Shipping carriers (Bosta, Aramex, …) | REQUIRES_EXTERNAL_CONFIG | Carrier name and tracking number entered manually; no carrier API integration yet |
| SMS / WhatsApp | PLANNED | No provider adapter |
| Error monitoring (Sentry or similar) | PLANNED | Structured logs with incident ids only |

## Localisation

| Area | Status | Notes |
|---|---|---|
| Arabic, RTL, EGP | COMPLETE | |
| English locale | PLANNED | Labels centralised in `src/i18n`; catalog has `nameEn` fields |

## Verified acceptance criteria

| Requirement | How it is verified |
|---|---|
| Browse → variant → lenses → cart → checkout → delivery/pickup → payment → staff processing → customer sees status | Playwright `e2e/acceptance.spec.ts` (sandbox card payment) plus manual browser runs of the prescription flow |
| No oversell | Integration test with parallel orders for the last unit; DB CHECK `reserved ≤ onHand` |
| Duplicate webhook processed once | Integration test; unique `(provider, eventId)` |
| RBAC cannot be bypassed via URL or API | Integration tests on services; Playwright anonymous `/admin` and forged webhook (401) |
| Refund never exceeds amount paid | Integration test; DB CHECK constraints |
| Historical orders immune to price changes | Integration test on snapshots |
| Stock movements traceable | Every change goes through `applyMovement` with actor, reason and reference; ledger is append-only |
