-- Data-integrity guarantees that Prisma's schema language cannot express.

-- Inventory projection can never go negative or reserve more than is on hand.
ALTER TABLE "inventory_item"
  ADD CONSTRAINT "inventory_item_on_hand_nonneg" CHECK ("onHand" >= 0),
  ADD CONSTRAINT "inventory_item_reserved_nonneg" CHECK ("reserved" >= 0),
  ADD CONSTRAINT "inventory_item_reserved_le_on_hand" CHECK ("reserved" <= "onHand");

ALTER TABLE "inventory_reservation" ADD CONSTRAINT "inventory_reservation_qty_pos" CHECK ("quantity" > 0);

-- Money and quantities.
ALTER TABLE "product_variant"
  ADD CONSTRAINT "variant_price_nonneg" CHECK ("price" >= 0 AND "costPrice" >= 0),
  ADD CONSTRAINT "variant_sale_price_valid" CHECK ("salePrice" IS NULL OR ("salePrice" >= 0 AND "salePrice" <= "price"));

ALTER TABLE "order"
  ADD CONSTRAINT "order_totals_nonneg" CHECK ("subtotal" >= 0 AND "total" >= 0 AND "discountTotal" >= 0 AND "shippingTotal" >= 0 AND "taxTotal" >= 0),
  ADD CONSTRAINT "order_paid_nonneg" CHECK ("paidTotal" >= 0 AND "refundedTotal" >= 0),
  ADD CONSTRAINT "order_refund_le_paid" CHECK ("refundedTotal" <= "paidTotal");

ALTER TABLE "order_item"
  ADD CONSTRAINT "order_item_qty_pos" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_item_returned_valid" CHECK ("returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity");

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_amount_pos" CHECK ("amount" > 0),
  ADD CONSTRAINT "payment_refund_le_amount" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amount");

ALTER TABLE "refund" ADD CONSTRAINT "refund_amount_pos" CHECK ("amount" > 0);

ALTER TABLE "cart_item" ADD CONSTRAINT "cart_item_qty_pos" CHECK ("quantity" > 0 AND "quantity" <= 20);

ALTER TABLE "loyalty_account" ADD CONSTRAINT "loyalty_balance_nonneg" CHECK ("balance" >= 0);

ALTER TABLE "promotion"
  ADD CONSTRAINT "promotion_value_nonneg" CHECK ("value" >= 0),
  ADD CONSTRAINT "promotion_usage_valid" CHECK ("usageLimit" IS NULL OR "usedCount" <= "usageLimit");

ALTER TABLE "review" ADD CONSTRAINT "review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "purchase_order_item"
  ADD CONSTRAINT "po_item_qty_valid" CHECK ("quantityOrdered" > 0 AND "quantityReceived" >= 0 AND "unitCost" >= 0);

ALTER TABLE "stock_transfer" ADD CONSTRAINT "transfer_distinct_branches" CHECK ("fromBranchId" <> "toBranchId");
ALTER TABLE "stock_transfer_item" ADD CONSTRAINT "transfer_item_qty_valid"
  CHECK ("quantityRequested" > 0 AND "quantityShipped" >= 0 AND "quantityReceived" >= 0 AND "quantityReceived" <= "quantityShipped");

-- Only one default address per customer.
CREATE UNIQUE INDEX "address_one_default_per_customer" ON "address" ("customerId") WHERE "isDefault";

-- Only one active cart per customer.
CREATE UNIQUE INDEX "cart_one_active_per_customer" ON "cart" ("customerId") WHERE "status" = 'ACTIVE' AND "customerId" IS NOT NULL;

-- Case-insensitive unique coupon codes.
CREATE UNIQUE INDEX "promotion_code_ci" ON "promotion" (upper("code")) WHERE "code" IS NOT NULL;

-- Append-only ledgers: history must never be edited or deleted.
CREATE OR REPLACE FUNCTION shams_reject_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only (% rejected)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inventory_movement_append_only BEFORE UPDATE OR DELETE ON "inventory_movement"
  FOR EACH ROW EXECUTE FUNCTION shams_reject_mutation();
CREATE TRIGGER loyalty_transaction_append_only BEFORE UPDATE OR DELETE ON "loyalty_transaction"
  FOR EACH ROW EXECUTE FUNCTION shams_reject_mutation();
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION shams_reject_mutation();
CREATE TRIGGER order_event_append_only BEFORE UPDATE OR DELETE ON "order_event"
  FOR EACH ROW EXECUTE FUNCTION shams_reject_mutation();
CREATE TRIGGER price_change_append_only BEFORE UPDATE OR DELETE ON "price_change"
  FOR EACH ROW EXECUTE FUNCTION shams_reject_mutation();
