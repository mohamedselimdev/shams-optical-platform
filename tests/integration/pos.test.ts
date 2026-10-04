import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { placePosSale } from "@/modules/pos/service";
import { assertLedgerConsistent, key, makeBranch, makeProduct, onHand, resetDb, staffActor, stock } from "../support/fixtures";

describe("point of sale", () => {
  beforeEach(resetDb);

  it("sells at the branch through the shared order core: SALE movement, paid order, change, idempotent", async () => {
    const branch = await makeBranch();
    const product = await makeProduct({ price: 150_000 });
    const variant = product.variants[0];
    await stock(branch.id, variant.id, 3);
    const cashier = staffActor("sales", { branchIds: [branch.id] });
    const idem = key();

    const sale = await placePosSale(cashier, { idempotencyKey: idem, branchId: branch.id, items: [{ variantId: variant.id, quantity: 2 }], paymentMethod: "CASH", cashTendered: "3500" });
    expect(sale.total).toBe(300_000);
    expect(sale.change).toBe(50_000);

    const order = await db.order.findUniqueOrThrow({ where: { id: sale.orderId }, include: { payments: true, items: true } });
    expect(order.channel).toBe("POS");
    expect(order.status).toBe("DELIVERED");
    expect(order.paymentStatus).toBe("PAID");
    expect(order.paidTotal).toBe(300_000);
    expect(order.payments.filter((p) => p.status === "SUCCEEDED")).toHaveLength(1);
    expect(order.items[0].unitPrice).toBe(150_000);
    expect(await onHand(branch.id, variant.id)).toEqual({ onHand: 1, reserved: 0 });
    const sale2 = await db.inventoryMovement.findFirst({ where: { referenceId: order.id, type: "SALE" } });
    expect(sale2?.quantity).toBe(-2);
    await assertLedgerConsistent();

    // A walk-in customer who also has an active web cart can buy in store; the web cart is untouched.
    const customer = await db.customer.create({ data: { firstName: "منى", phone: "01077778888" } });
    const webCart = await db.cart.create({ data: { token: key(), customerId: customer.id, items: { create: [{ variantId: variant.id, quantity: 1 }] } } });
    const linked = await placePosSale(cashier, { idempotencyKey: key(), branchId: branch.id, items: [{ variantId: variant.id, quantity: 1 }], paymentMethod: "CARD_PRESENT", customerPhone: "01077778888" });
    expect((await db.order.findUniqueOrThrow({ where: { id: linked.orderId } })).customerId).toBe(customer.id);
    expect((await db.cart.findUniqueOrThrow({ where: { id: webCart.id } })).status).toBe("ACTIVE");
    await stock(branch.id, variant.id, 1);

    // Re-submitting the same sale never charges or deducts twice.
    const dup = await placePosSale(cashier, { idempotencyKey: idem, branchId: branch.id, items: [{ variantId: variant.id, quantity: 2 }], paymentMethod: "CASH", cashTendered: "3500" });
    expect(dup).toMatchObject({ orderId: sale.orderId, duplicate: true });
    expect(await onHand(branch.id, variant.id)).toEqual({ onHand: 1, reserved: 0 });
  });

  it("rejects short cash, card numbers, other branches and overselling", async () => {
    const [branch, other] = await Promise.all([makeBranch(), makeBranch()]);
    const product = await makeProduct({ price: 100_000 });
    const variant = product.variants[0];
    await stock(branch.id, variant.id, 1);
    const cashier = staffActor("sales", { branchIds: [branch.id] });
    const base = { branchId: branch.id, items: [{ variantId: variant.id, quantity: 1 }] };

    await expect(placePosSale(cashier, { ...base, idempotencyKey: key(), paymentMethod: "CASH", cashTendered: "50" })).rejects.toThrow(/أقل من الإجمالي/);
    await expect(placePosSale(cashier, { ...base, idempotencyKey: key(), paymentMethod: "CARD_PRESENT", cardReference: "4111 1111 1111 1111" })).rejects.toThrow();
    await expect(placePosSale(cashier, { ...base, branchId: other.id, idempotencyKey: key(), paymentMethod: "CARD_PRESENT" })).rejects.toThrow();
    await expect(placePosSale(cashier, { ...base, items: [{ variantId: variant.id, quantity: 2 }], idempotencyKey: key(), paymentMethod: "CARD_PRESENT" })).rejects.toThrow();
    await expect(placePosSale(staffActor("inventory"), { ...base, idempotencyKey: key(), paymentMethod: "CARD_PRESENT" })).rejects.toThrow();

    expect(await onHand(branch.id, variant.id)).toEqual({ onHand: 1, reserved: 0 });
    expect(await db.order.count()).toBe(0);
  });
});
