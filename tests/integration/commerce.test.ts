import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { placeOrder } from "@/modules/checkout/service";
import { sandboxComplete, handleWebhook, refundPayment } from "@/modules/payments/service";
import { transitionOrder } from "@/modules/orders/service";
import { saveProduct } from "@/modules/catalog/service";
import { SandboxProvider } from "@/modules/payments/providers/sandbox";
import { DomainError } from "@/server/errors";
import { address, assertLedgerConsistent, key, makeBranch, makeCart, makeCustomer, makeProduct, makeShipping, onHand, resetDb, staffActor, stock } from "../support/fixtures";

const ops = staffActor("operations_manager");
const accountant = staffActor("accountant");
const owner = staffActor("owner");

async function setupStore() {
  const branch = await makeBranch({ shipsOnline: true });
  const product = await makeProduct({ price: 150_000, cost: 60_000 });
  const variant = product.variants[0];
  const rate = await makeShipping();
  return { branch, product, variant, rate };
}

function checkoutInput(rateId: string, overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: key(),
    contactName: "أحمد علي",
    contactPhone: "01012345678",
    contactEmail: "ahmed@example.com",
    fulfillmentType: "DELIVERY" as const,
    shippingRateId: rateId,
    address,
    paymentMethod: "CARD" as const,
    ...overrides,
  };
}

describe("critical commerce flow", () => {
  beforeAll(resetDb);
  beforeEach(resetDb);

  it("runs the end-to-end acceptance flow with consistent payment, inventory, order and audit records", async () => {
    const { branch, variant, rate } = await setupStore();
    await stock(branch.id, variant.id, 5);
    const customer = await makeCustomer();
    const cart = await makeCart([{ variantId: variant.id, quantity: 2 }], customer.customerId);

    const result = await placeOrder({ actor: customer, customerId: customer.customerId, cartToken: cart.token }, checkoutInput(rate.id));
    expect(result.requiresOnlinePayment).toBe(true);

    let order = await db.order.findUniqueOrThrow({ where: { id: result.orderId }, include: { items: true } });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(order.subtotal).toBe(300_000);
    expect(order.shippingTotal).toBe(0); // free over 2,500 EGP
    expect(order.total).toBe(300_000);
    expect(await onHand(branch.id, variant.id)).toEqual({ onHand: 5, reserved: 2 });

    // Browser "success" is irrelevant; only the signed webhook confirms payment.
    const { initiateOnlinePayment } = await import("@/modules/payments/service");
    const payment = await initiateOnlinePayment(order.id, "CARD");
    expect(payment.redirectUrl).toContain("/pay/sandbox/");
    expect(await sandboxComplete(payment.id, "SUCCEEDED")).toBe("processed");

    order = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(order.status).toBe("PAID");
    expect(order.paymentStatus).toBe("PAID");
    expect(order.paidTotal).toBe(300_000);

    for (const to of ["PROCESSING", "READY"] as const) await transitionOrder(ops, order.id, { to });
    await transitionOrder(ops, order.id, { to: "SHIPPED", carrier: "Bosta", trackingNumber: "BX123" });
    expect(await onHand(branch.id, variant.id)).toEqual({ onHand: 3, reserved: 0 });
    await transitionOrder(ops, order.id, { to: "DELIVERED" });

    order = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    expect(order.status).toBe("DELIVERED");
    const loyalty = await db.loyaltyAccount.findUniqueOrThrow({ where: { customerId: customer.customerId } });
    expect(loyalty.balance).toBe(3000); // 1 point per EGP
    const events = await db.orderEvent.findMany({ where: { orderId: order.id } });
    expect(events.filter((e) => e.type === "STATUS_CHANGED").map((e) => e.toStatus)).toEqual(["PAID", "PROCESSING", "READY", "SHIPPED", "DELIVERED"]);
    const audits = await db.auditLog.count({ where: { entityType: "order", entityId: order.id } });
    expect(audits).toBeGreaterThanOrEqual(5);
    const movements = await db.inventoryMovement.findMany({ where: { referenceId: order.id }, orderBy: { createdAt: "asc" } });
    expect(movements.map((m) => m.type)).toEqual(["RESERVATION", "SALE"]);
    const notifications = await db.job.count({ where: { type: "notify.order_status" } });
    expect(notifications).toBeGreaterThan(0);
    await assertLedgerConsistent();
  });

  it("prevents overselling under concurrent checkouts", async () => {
    const { branch, variant, rate } = await setupStore();
    await stock(branch.id, variant.id, 3);
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, async () => {
        const cart = await makeCart([{ variantId: variant.id, quantity: 1 }]);
        return placeOrder({ actor: null, customerId: null, cartToken: cart.token }, checkoutInput(rate.id, { paymentMethod: "COD" }));
      }),
    );
    const ok = attempts.filter((a) => a.status === "fulfilled");
    const failed = attempts.filter((a) => a.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(3);
    expect(failed.every((f) => f.reason instanceof DomainError && f.reason.code === "INSUFFICIENT_STOCK")).toBe(true);
    expect(await onHand(branch.id, variant.id)).toEqual({ onHand: 3, reserved: 3 });
    await assertLedgerConsistent();
  });

  it("returns the original order for duplicate submissions (idempotency)", async () => {
    const { branch, variant, rate } = await setupStore();
    await stock(branch.id, variant.id, 5);
    const cart = await makeCart([{ variantId: variant.id, quantity: 1 }]);
    const input = checkoutInput(rate.id, { paymentMethod: "COD" });
    const [a, b] = await Promise.all([
      placeOrder({ actor: null, customerId: null, cartToken: cart.token }, input),
      placeOrder({ actor: null, customerId: null, cartToken: cart.token }, input),
    ]);
    expect(a.orderId).toBe(b.orderId);
    expect(await db.order.count()).toBe(1);
    expect(await onHand(branch.id, variant.id)).toEqual({ onHand: 5, reserved: 1 });
  });

  it("processes duplicate payment webhooks exactly once and rejects bad signatures", async () => {
    const { branch, variant, rate } = await setupStore();
    await stock(branch.id, variant.id, 5);
    const cart = await makeCart([{ variantId: variant.id, quantity: 1 }]);
    const r = await placeOrder({ actor: null, customerId: null, cartToken: cart.token }, checkoutInput(rate.id));
    const { initiateOnlinePayment } = await import("@/modules/payments/service");
    const payment = await initiateOnlinePayment(r.orderId, "CARD");

    expect(await sandboxComplete(payment.id, "SUCCEEDED")).toBe("processed");
    expect(await sandboxComplete(payment.id, "SUCCEEDED")).toBe("duplicate");
    // A different event id for the same payment must not double-count either.
    const body = JSON.stringify({ id: "evt_other", type: "payment", externalId: payment.externalId, paymentId: payment.id, status: "SUCCEEDED", amount: payment.amount, currency: "EGP" });
    expect(await handleWebhook("sandbox", { headers: new Headers({ "x-sandbox-signature": SandboxProvider.sign(body) }), rawBody: body, query: new URLSearchParams() })).toBe("processed");
    // Tampered payload with a stale signature is rejected.
    const forged = body.replace(String(payment.amount), "1");
    expect(await handleWebhook("sandbox", { headers: new Headers({ "x-sandbox-signature": SandboxProvider.sign(body) }), rawBody: forged, query: new URLSearchParams() })).toBe("invalid_signature");

    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    expect(order.paidTotal).toBe(payment.amount);
    expect(await db.payment.count({ where: { orderId: r.orderId, status: "SUCCEEDED" } })).toBe(1);
    expect(await db.orderEvent.count({ where: { orderId: r.orderId, toStatus: "PAID" } })).toBe(1);
  });

  it("never refunds more than the paid amount, including concurrent refunds", async () => {
    const { branch, variant, rate } = await setupStore();
    await stock(branch.id, variant.id, 5);
    const cart = await makeCart([{ variantId: variant.id, quantity: 1 }]);
    const r = await placeOrder({ actor: null, customerId: null, cartToken: cart.token }, checkoutInput(rate.id));
    const { initiateOnlinePayment } = await import("@/modules/payments/service");
    const payment = await initiateOnlinePayment(r.orderId, "CARD");
    await sandboxComplete(payment.id, "SUCCEEDED");
    const paid = payment.amount; // 1,560 EGP incl. shipping

    await refundPayment(accountant, { paymentId: payment.id, amount: "500", reason: "خصم إضافي" });
    await expect(refundPayment(accountant, { paymentId: payment.id, amount: String(paid / 100), reason: "تجاوز" })).rejects.toThrow(/أقصى مبلغ/);

    const remaining = (paid - 50_000) / 100;
    const results = await Promise.allSettled([
      refundPayment(accountant, { paymentId: payment.id, amount: String(remaining), reason: "طلب أول" }),
      refundPayment(accountant, { paymentId: payment.id, amount: String(remaining), reason: "طلب ثاني" }),
    ]);
    expect(results.filter((x) => x.status === "fulfilled"), JSON.stringify(results.map((x) => (x.status === "rejected" ? String(x.reason) : "ok")))).toHaveLength(1);
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    expect(order.refundedTotal).toBe(paid);
    expect(order.paymentStatus).toBe("REFUNDED");
    const sum = await db.refund.aggregate({ where: { paymentId: payment.id, status: "SUCCEEDED" }, _sum: { amount: true } });
    expect(sum._sum.amount).toBe(paid);
  });

  it("keeps historical orders unchanged when product prices change", async () => {
    const { branch, product, variant, rate } = await setupStore();
    await stock(branch.id, variant.id, 5);
    const cart = await makeCart([{ variantId: variant.id, quantity: 1 }]);
    const r = await placeOrder({ actor: null, customerId: null, cartToken: cart.token }, checkoutInput(rate.id, { paymentMethod: "COD" }));
    const before = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: true } });

    await saveProduct(owner, product.id, {
      slug: product.slug,
      name: "اسم جديد تماماً",
      type: "FRAME",
      status: "ACTIVE",
      variants: [{ id: variant.id, sku: variant.sku, price: "2999", costPrice: "1000", isActive: "on" }],
    });
    const after = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: true } });
    expect(after.total).toBe(before.total);
    expect(after.items[0].unitPrice).toBe(150_000);
    expect(after.items[0].productName).toBe(before.items[0].productName);
    expect(after.items[0].unitCost).toBe(60_000);
    const history = await db.priceChange.findMany({ where: { variantId: variant.id, field: "price" } });
    expect(history.at(-1)?.newValue).toBe(299_900);
  });

  it("releases stock, promotions and loyalty when an unpaid order is cancelled", async () => {
    const { branch, variant, rate } = await setupStore();
    await stock(branch.id, variant.id, 2);
    const customer = await makeCustomer();
    await db.promotion.create({ data: { name: "10%", kind: "COUPON", code: "TEN", discountType: "PERCENTAGE", value: 1000, usageLimit: 1 } });
    const cart = await makeCart([{ variantId: variant.id, quantity: 1 }], customer.customerId);
    const r = await placeOrder({ actor: customer, customerId: customer.customerId, cartToken: cart.token }, checkoutInput(rate.id, { paymentMethod: "COD", couponCode: "ten" }));
    let promo = await db.promotion.findFirstOrThrow({ where: { code: "TEN" } });
    expect(promo.usedCount).toBe(1);

    await expect(transitionOrder(staffActor("sales"), r.orderId, { to: "CANCELLED", reason: "x" })).rejects.toThrow();
    await transitionOrder(ops, r.orderId, { to: "CANCELLED", reason: "طلب العميل" });
    expect(await onHand(branch.id, variant.id)).toEqual({ onHand: 2, reserved: 0 });
    promo = await db.promotion.findFirstOrThrow({ where: { code: "TEN" } });
    expect(promo.usedCount).toBe(0);
    await assertLedgerConsistent();
  });
});
