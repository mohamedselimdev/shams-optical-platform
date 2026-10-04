# SHAMS — Security

This document describes the controls that exist in code today and the configuration a production
deployment must provide. Anything not listed here should be assumed absent.

## Principles

1. **The server is the only authority** for prices, discounts, shipping, tax, loyalty, stock,
   payment status and permissions. The client sends identifiers and quantities; everything else is
   recomputed from the database inside a transaction.
2. **Authorization lives in services**, not in pages or components. Hiding a button is cosmetic.
3. **Least data**: card data never touches SHAMS, prescriptions are private, logs are redacted.
4. **Fail closed**: missing configuration disables a feature (or refuses to start in production)
   rather than falling back to an insecure default.

## Authentication

* better-auth with scrypt password hashing, database sessions and `HttpOnly`, `SameSite=Lax`,
  `Secure` (production) cookies. Minimum password length 10.
* Built-in rate limits on sign-in, sign-up and password reset endpoints; storefront tracking lookups
  are rate limited per IP hash (`src/server/rate-limit.ts`).
* Password reset does not reveal whether an account exists. Email verification is wired to the
  email transport.
* Staff and customers share the user table but are separated by profile: `requireStaff()` demands an
  active `StaffProfile`; `requireCustomer()` demands a `Customer`. A customer session cannot open
  any `/admin` route or staff action.
* Staff 2FA: **PLANNED**.

## Authorization (RBAC)

* **52 permissions** (`src/server/rbac/permissions.ts`), **11 system roles**, plus custom roles.
* Roles can be global or limited to branches. `assertCan(actor, permission, branchId?)` is called
  inside every service; queries use `branchScope()` so branch staff only see their branches.
* Escalation prevention: staff cannot create roles with permissions they do not hold, grant
  all-branch access unless they have it, assign the owner role or edit an owner account unless they
  are an owner, edit the system owner role, or deactivate their own account.
* Pages call the same checks, so typing an admin URL or posting a server action directly returns
  the forbidden page or a safe error. Tests cover direct service calls and the browser path
  (anonymous `/admin` access is redirected in the Playwright suite).

## Payments

* SHAMS **never receives or stores card numbers or CVV**. Cards and wallets go through the
  provider's hosted page (Paymob, REQUIRES_EXTERNAL_CONFIG).
* Payment status changes only through **verified webhooks** (HMAC for Paymob, HMAC-SHA256 for the
  sandbox) or server-side reconciliation, never through the browser return URL.
* Webhooks are stored in `webhook_event` with a unique `(provider, eventId)`; duplicates return 200
  without side effects. Invalid signatures return 401. Amount and currency must match the payment.
* Refunds lock the payment and order, are limited to the refundable amount and are backed by CHECK
  constraints (`refundedTotal ≤ paidTotal`, payment refund ≤ amount). Refunds require
  `payments.refund` and are audited.
* POS card payments store only a terminal reference; references with 12+ digits are rejected to
  stop staff typing a card number.
* The sandbox gateway refuses to run in production, and the app refuses to start in production if
  the sandbox secret is left at its default.

## Prescriptions and personal data

* Prescription values and uploaded files are private to the customer and to staff with
  `prescriptions.view`. Every staff view or file download writes an audit entry with a reason.
* Uploaded files are stored under generated keys in **private** storage, validated by magic bytes
  (JPEG, PNG, WebP, PDF) and size, and served only through an authenticated route with
  `Cache-Control: private, no-store`.
* Prescription lenses require a signed-in customer account (guest checkout cannot attach health
  data).
* The logger (`src/server/logger.ts`) redacts passwords, tokens, secrets, cookies, authorization
  headers, card fields and prescription values. Analytics never records prescription values, and
  stores only a salted IP hash.
* Branch availability on the storefront exposes levels (in stock / low / none), never counts.

## Input handling and output

* Zod validates every form, route handler, setting and webhook payload. Server actions accept a
  narrow schema and ignore unknown fields.
* No raw HTML from staff or customers is rendered: CMS uses typed blocks, reviews are text. JSON-LD
  is serialised with `<` escaped.
* CSV exports prefix cells starting with `= + - @` to prevent formula injection.
* Errors: `runAction` and route handlers return generic Arabic messages with an incident id; stack
  traces and internal messages are logged server-side only.

## HTTP hardening (`src/proxy.ts`, `next.config.ts`)

* Content-Security-Policy with a per-request nonce (`script-src 'nonce-…' 'strict-dynamic'`,
  `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`).
* `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
  strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`, HSTS in production, no
  `X-Powered-By`.
* Server actions are protected by Next.js origin checks; better-auth enforces trusted origins.
* Server action bodies are capped at 9 MB (prescription uploads are limited further in code).

## Auditing

`audit_log` is append-only (database trigger). It records staff and system actions on orders,
payments, refunds, stock, prices, promotions, roles, staff, settings, prescriptions and exports,
with before/after diffs, actor, IP hash and user agent. Viewing requires `audit.view`.

## Secrets and configuration

* Secrets come only from environment variables (`.env.example` lists them) and are validated at
  start-up by `src/server/env.ts`. Production refuses to start with default or short secrets.
* Integrations without credentials are reported as REQUIRES_EXTERNAL_CONFIG on the Integrations
  page; no secret value is ever displayed.
* Never commit `.env`. Rotate `BETTER_AUTH_SECRET` (invalidates sessions), `PAYMOB_HMAC_SECRET` and
  storage keys through the hosting provider's secret store.

## Production checklist

- [ ] TLS everywhere; `APP_URL` set to the public https origin.
- [ ] `BETTER_AUTH_SECRET` and `IP_HASH_SALT` set to long random values.
- [ ] `PAYMENT_SANDBOX_ENABLED=false`; Paymob keys and HMAC secret set; webhook URL
      `https://<host>/api/webhooks/payments/paymob` registered with Paymob.
- [ ] `RESEND_API_KEY` set and sender domain verified.
- [ ] `STORAGE_DRIVER=s3` with a public bucket for media and a private bucket with all public access
      blocked for prescriptions.
- [ ] Database: least-privilege role for the app, automated backups, restore tested.
- [ ] Worker process running (`npm run worker`).
- [ ] Seed passwords removed from the environment after first deploy; owner password changed.
- [ ] Error monitoring and log shipping configured (not built in; PLANNED).
