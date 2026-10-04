# SHAMS — Database

PostgreSQL 16, managed by Prisma migrations in `prisma/migrations`. The schema
(`prisma/schema.prisma`) has **73 models**. Integrity rules that Prisma cannot express live in the
`*_integrity` migration as raw SQL, so they hold even if application code is wrong.

## Conventions

* **Money** is `Int` in **piasters** (1 EGP = 100). No floats or decimals anywhere in money paths.
* **Optics**: sphere / cylinder / add are stored in **hundredths of a diopter** (−2.25 → `-225`),
  axis in degrees, PD in **tenths of a millimetre** (63.5 → `635`). Conversions live in `src/lib/optics.ts`.
* **Time** is stored as `timestamptz` (UTC); business days and reports use `Africa/Cairo`.
* IDs are text (cuid). Human-facing numbers (orders `SH-…`, POs, transfers, returns) come from the
  `counter` table, incremented inside the creating transaction.
* Table names are snake_case (`@@map`).

## Domain map

| Area | Models |
|---|---|
| Identity & access | `User`, `Session`, `Account`, `Verification` (better-auth), `RateLimit`, `StaffProfile`, `Role`, `RolePermission`, `StaffRole`, `StaffBranch` |
| Customers | `Customer`, `Address`, `CustomerNote`, `WishlistItem` |
| Catalog | `Product`, `ProductVariant`, `ProductImage`, `Brand`, `Category`, `Collection`, `CollectionProduct`, `PriceChange`, `MediaAsset` |
| Lenses | `LensType`, `LensIndex`, `LensPackagePrice`, `LensOption`, `LensOptionRule` |
| Prescriptions | `Prescription` (values, optional private file key, verification status) |
| Branches & stock | `Branch`, `InventoryItem`, `InventoryMovement`, `InventoryReservation`, `StockTransfer`, `StockTransferItem`, `StockTransferEvent` |
| Purchasing | `Supplier`, `PurchaseOrder`, `PurchaseOrderItem`, `GoodsReceipt`, `GoodsReceiptItem` |
| Sales | `Cart`, `CartItem`, `Order`, `OrderItem`, `OrderEvent`, `Shipment` |
| Payments | `Payment`, `Refund`, `WebhookEvent` (inbox, unique per provider event) |
| Returns | `ReturnRequest`, `ReturnItem`, `ReturnEvent` |
| Marketing | `Promotion`, `PromotionCustomer`, `PromotionRedemption`, `LoyaltyAccount`, `LoyaltyTransaction`, `Review` |
| Shipping | `ShippingZone`, `ShippingRate` |
| Content | `ContentPage`, `Banner`, `NavigationItem`, `Announcement`, `HomeSection` |
| Analytics | `AnalyticsSession`, `AnalyticsEvent` |
| Platform | `Setting`, `AuditLog`, `Notification`, `Job`, `Counter` |

## Snapshots

Orders never read live catalog data after placement. `order` stores contact, address, totals,
tax, discount and shipping; `order_item` stores product and variant names, SKU, color, unit price,
unit cost, discount allocation, tax and the full lens configuration and prescription values used.
Changing a price, lens table or prescription later has no effect on existing orders (covered by an
integration test).

## Append-only ledgers

Triggers raise an exception on `UPDATE` or `DELETE` for:

| Table | Purpose |
|---|---|
| `inventory_movement` | Every stock change (receipt, sale, return, adjustment, transfer in/out, damage) with actor, reason and reference |
| `loyalty_transaction` | Points earned, redeemed, reversed, adjusted |
| `audit_log` | Staff and system actions with before/after diff, IP hash, user agent |
| `order_event` | Order timeline |
| `price_change` | Variant price history |

Corrections are new rows (for example a reversing movement), never edits.
`inventory_item.onHand/reserved` and `loyalty_account.balance` are projections updated in the same
transaction as their ledger row.

## CHECK constraints

| Constraint | Rule |
|---|---|
| `inventory_item_on_hand_nonneg`, `_reserved_nonneg`, `_reserved_le_on_hand` | `0 ≤ reserved ≤ onHand` (no oversell even under races) |
| `inventory_reservation_qty_pos` | Reservation quantity > 0 |
| `variant_price_nonneg`, `variant_sale_price_valid` | Prices ≥ 0, sale price below regular price |
| `order_totals_nonneg`, `order_paid_nonneg` | Totals and paid amount ≥ 0 |
| `order_refund_le_paid` | `refundedTotal ≤ paidTotal` |
| `order_item_qty_pos`, `order_item_returned_valid` | Quantity > 0, returned ≤ quantity |
| `payment_amount_pos`, `payment_refund_le_amount` | Refunds never exceed the captured amount |
| `refund_amount_pos`, `cart_item_qty_pos` | Positive amounts and quantities |
| `loyalty_balance_nonneg` | Balance cannot go negative |
| `promotion_value_nonneg`, `promotion_usage_valid` | Valid values, usage within limit |
| `review_rating_range` | Rating 1–5 |
| `po_item_qty_valid` | Received ≤ ordered |
| `transfer_distinct_branches` | Source ≠ destination |

## Partial and functional unique indexes

* `address_one_default_per_customer` — one default address per customer.
* `cart_one_active_per_customer` — one active cart per customer (POS transient carts are unlinked).
* `promotion_code_ci` — coupon codes unique case-insensitively.
* `webhook_event (provider, eventId)` unique — a webhook delivered twice is processed once.
* `order.idempotencyKey` and `payment.idempotencyKey` unique — a double-submitted checkout or payment attempt returns the original record.
* `job.dedupeKey` unique — periodic jobs are scheduled once per slot.

## Concurrency patterns

* Stock: conditional update in `applyMovement` / `reserveStock` (`… WHERE onHand - reserved >= qty`)
  plus the CHECK constraints; a concurrency test fires parallel orders for the last unit.
* Checkout: `SELECT … FOR UPDATE` on the customer and promotion rows.
* Refunds: lock payment and order rows before computing refundable amounts.
* Jobs: `FOR UPDATE SKIP LOCKED` so several workers can run safely.

## Background job types

`notify.order_status`, `orders.expire_pending`, `payments.reconcile`, `payments.refund_orphan`,
`carts.mark_abandoned`.

## Operations

```bash
npx prisma migrate deploy      # apply migrations (production)
npx prisma migrate dev         # create a migration (development)
npm run db:seed                # roles, permissions, branches, settings, catalog, lenses (idempotent)
npm run db:reset               # drop + migrate + seed (development only)
```

Back up with `pg_dump` on a schedule and test restores; ledgers are the system of record for stock
and loyalty, so never truncate them.
