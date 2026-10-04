# SHAMS — Implementation Status

Legend: **COMPLETE** (implemented, wired end-to-end, tested) · **PARTIAL** (works, with listed gaps) ·
**REQUIRES_EXTERNAL_CONFIG** (real adapter exists; needs credentials) · **BLOCKED** · **PLANNED**

_Last updated: 2026-10-04_

| Area | Status | Notes |
|---|---|---|
| Database schema, constraints, append-only ledgers | COMPLETE | 60+ tables, CHECK constraints, partial unique indexes, DB triggers block UPDATE/DELETE on movements, loyalty, audit, order events, price history |
| Money / tax engine | COMPLETE | Integer piasters, VAT-inclusive (configurable), largest-remainder allocation; unit tested |
| Authentication | COMPLETE (core) | better-auth: scrypt hashing, DB sessions, secure cookies, origin checks, rate limits; email verification & reset flows wired to email transport |
| RBAC (server-enforced, branch-scoped) | COMPLETE | 52 permissions, 11 system roles, custom roles, escalation prevention; enforced inside services; tested |
| Branches | COMPLETE (domain) | UI in progress |
| Catalog (products, variants, brands, categories, collections) | COMPLETE (domain) | Price history + audit; UI in progress |
| Lens configurator (types × index matrix, options, compatibility, power limits) | COMPLETE (domain) | Server-authoritative pricing; tested |
| Prescriptions (private, audited) | COMPLETE (domain) | Values + private upload; staff view/file access audited; verification gate before lens preparation |
| Inventory ledger, reservations, oversell protection | COMPLETE | Atomic conditional updates; concurrency test proves no oversell |
| Stock transfers (Draft→Approved→In Transit→Received) | COMPLETE (domain) | Reservation on approval, discrepancy reasons, timeline; UI in progress |
| Suppliers & purchase orders, goods receipts | COMPLETE (domain) | Partial receipts, moving-average cost; UI in progress |
| Cart (guest/auth, merge) | COMPLETE (domain) | UI in progress |
| Checkout (delivery/pickup, shipping, coupons, loyalty, Rx confirmation, idempotency) | COMPLETE (domain) | Full server revalidation; duplicate submission safe; UI in progress |
| Order state machine & timeline | COMPLETE (domain) | Side effects: stock deduction, COD/branch collection, loyalty, reversals, notifications |
| Payments abstraction, webhooks, idempotency, refunds, reconciliation | COMPLETE (domain) | Sandbox gateway exercises the real webhook path |
| Paymob (cards/wallets) | REQUIRES_EXTERNAL_CONFIG | Intention API + HMAC verification implemented; not verified against live credentials; status inquiry for reconciliation pending credentials |
| Returns / exchanges | PARTIAL | Full refund flow with restock/damage ledger; exchanges are recorded but the replacement order is created manually |
| Promotions engine | COMPLETE (domain) | Coupons/automatic, %/fixed/free shipping, scopes, limits, stacking rules; tested |
| Loyalty ledger | COMPLETE (domain) | Earn on delivery, redeem at checkout, reversals |
| Reviews | COMPLETE (domain) | Moderation, verified purchase |
| Analytics (first-party) | PARTIAL | Sessions/events/attribution/funnel queries done; collection endpoint & consent banner in progress |
| GA4 forwarding | REQUIRES_EXTERNAL_CONFIG | Planned via job queue when GA4 keys are set |
| Reports | COMPLETE (domain) | Sales, branch, product/brand/category margin, payments, valuation, low/dead stock, purchasing, returns, discounts, customers, loyalty, attribution; exports in progress |
| CMS (structured blocks, banners, nav, announcements, home sections) | COMPLETE (domain) | No raw HTML |
| Background jobs (Postgres queue) | COMPLETE | Outbox-style, SKIP LOCKED workers, retries with backoff |
| Email | PARTIAL | Dev mailbox + Resend adapter; production needs RESEND_API_KEY |
| SMS | REQUIRES_EXTERNAL_CONFIG | Notifications recorded as SKIPPED until a provider is configured |
| File storage | COMPLETE (local) / REQUIRES_EXTERNAL_CONFIG (S3) | Magic-byte validation, generated keys, public/private separation |
| Admin dashboard UI | PLANNED (next) | |
| Storefront UI | PLANNED (next) | |
| POS (dashboard) | PLANNED | Core is POS-ready (channel, branch, staff, payment methods) |
| CI (lint, typecheck, tests, build) | PLANNED (next) | |
| Two-factor auth for staff | PLANNED | better-auth two-factor plugin available |
| Split shipments across branches | PLANNED | Orders are fulfilled from a single branch |
