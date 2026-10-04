import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { approveTransfer, cancelTransfer, createTransfer, receiveTransfer, shipTransfer } from "@/modules/transfers/service";
import { createPurchaseOrder, receivePurchaseOrder, sendPurchaseOrder } from "@/modules/purchasing/service";
import { placeOrder } from "@/modules/checkout/service";
import { transitionOrder } from "@/modules/orders/service";
import { reviewPrescription } from "@/modules/prescriptions/service";
import { createReturn, reviewReturn, receiveReturn, inspectReturn, completeReturn } from "@/modules/returns/service";
import { adjustStock } from "@/modules/inventory/service";
import { address, assertLedgerConsistent, key, makeBranch, makeCart, makeCustomer, makeProduct, makeShipping, onHand, resetDb, staffActor, stock } from "../support/fixtures";

const ops = staffActor("operations_manager");
const owner = staffActor("owner");

describe("inventory operations", () => {
  beforeEach(resetDb);

  it("moves stock through Draft → Approved → In Transit → Received with discrepancy handling", async () => {
    const from = await makeBranch();
    const to = await makeBranch();
    const p = await makeProduct();
    const v = p.variants[0];
    await stock(from.id, v.id, 10);

    const t = await createTransfer(ops, { fromBranchId: from.id, toBranchId: to.id, items: [{ variantId: v.id, quantity: 6 }] });
    await approveTransfer(ops, t.id);
    expect(await onHand(from.id, v.id)).toEqual({ onHand: 10, reserved: 6 });
    await expect(receiveTransfer(ops, t.id, { items: [] })).rejects.toMatchObject({ code: "INVALID_STATE" });

    await shipTransfer(ops, t.id);
    expect(await onHand(from.id, v.id)).toEqual({ onHand: 4, reserved: 0 });
    const item = await db.stockTransferItem.findFirstOrThrow({ where: { transferId: t.id } });
    await expect(receiveTransfer(ops, t.id, { items: [{ itemId: item.id, quantityReceived: 5 }] })).rejects.toThrow(/سبب/);
    const res = await receiveTransfer(ops, t.id, { items: [{ itemId: item.id, quantityReceived: 5, discrepancyReason: "قطعة مكسورة أثناء النقل" }] });
    expect(res.discrepancies).toHaveLength(1);
    expect(await onHand(to.id, v.id)).toEqual({ onHand: 5, reserved: 0 });
    const events = await db.stockTransferEvent.findMany({ where: { transferId: t.id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.toStatus)).toEqual(["DRAFT", "APPROVED", "IN_TRANSIT", "RECEIVED"]);
    await assertLedgerConsistent();
  });

  it("cancelling an approved transfer releases its reservation", async () => {
    const from = await makeBranch();
    const to = await makeBranch();
    const p = await makeProduct();
    await stock(from.id, p.variants[0].id, 3);
    const t = await createTransfer(ops, { fromBranchId: from.id, toBranchId: to.id, items: [{ variantId: p.variants[0].id, quantity: 3 }] });
    await approveTransfer(ops, t.id);
    await cancelTransfer(ops, t.id, "تغيير الخطة");
    expect(await onHand(from.id, p.variants[0].id)).toEqual({ onHand: 3, reserved: 0 });
  });

  it("receives purchase orders partially via ledger movements and updates moving-average cost", async () => {
    const branch = await makeBranch();
    const p = await makeProduct({ cost: 40_000 });
    const v = p.variants[0];
    await stock(branch.id, v.id, 10);
    const supplier = await db.supplier.create({ data: { code: "SUP-1", name: "مورد" } });
    const po = await createPurchaseOrder(staffActor("purchasing"), { supplierId: supplier.id, branchId: branch.id, items: [{ variantId: v.id, quantity: 10, unitCost: "500" }] });
    await expect(receivePurchaseOrder(ops, po.id, { items: [] })).rejects.toMatchObject({ code: "INVALID_STATE" });
    await sendPurchaseOrder(staffActor("purchasing"), po.id);
    const item = await db.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } });
    const r1 = await receivePurchaseOrder(ops, po.id, { items: [{ poItemId: item.id, quantity: 4 }] });
    expect(r1.status).toBe("PARTIALLY_RECEIVED");
    await expect(receivePurchaseOrder(ops, po.id, { items: [{ poItemId: item.id, quantity: 7 }] })).rejects.toThrow(/المتبقي/);
    const r2 = await receivePurchaseOrder(ops, po.id, { items: [{ poItemId: item.id, quantity: 6 }] });
    expect(r2.status).toBe("RECEIVED");
    expect(await onHand(branch.id, v.id)).toEqual({ onHand: 20, reserved: 0 });
    // (10×400 + 4×500) / 14 = 428.57 → 42,857; then (14×428.57 + 6×500)/20 = 450 → 45,000
    const variant = await db.productVariant.findUniqueOrThrow({ where: { id: v.id } });
    expect(variant.costPrice).toBe(45_000);
    expect(await db.inventoryMovement.count({ where: { referenceId: po.id, type: "PURCHASE_RECEIPT" } })).toBe(2);
    await assertLedgerConsistent();
  });

  it("refuses adjustments that would drop stock below reserved quantity", async () => {
    const branch = await makeBranch();
    const p = await makeProduct();
    await stock(branch.id, p.variants[0].id, 2);
    const rate = await makeShipping();
    const cart = await makeCart([{ variantId: p.variants[0].id, quantity: 2 }]);
    await placeOrder({ actor: null, customerId: null, cartToken: cart.token }, { idempotencyKey: key(), contactName: "س", contactPhone: "01012345678", fulfillmentType: "DELIVERY", shippingRateId: rate.id, address, paymentMethod: "COD" });
    await expect(adjustStock(ops, { branchId: branch.id, variantId: p.variants[0].id, mode: "count", value: 1, reason: "جرد" })).rejects.toThrow(/المحجوزة/);
    expect(await db.auditLog.count({ where: { action: "inventory.adjust" } })).toBe(0);
  });
});

describe("prescription lenses, pickup and returns", () => {
  beforeEach(resetDb);

  async function lensSetup() {
    const type = await db.lensType.create({ data: { key: "SV", name: "رؤية أحادية", requiresPrescription: true } });
    const idx = await db.lensIndex.create({ data: { key: "1.50", value: 150, name: "1.50", minSph: -400, maxSph: 400, maxCyl: 200 } });
    const idx2 = await db.lensIndex.create({ data: { key: "1.67", value: 167, name: "1.67", minSph: -1000, maxSph: 800, maxCyl: 400 } });
    await db.lensPackagePrice.create({ data: { lensTypeId: type.id, lensIndexId: idx.id, price: 45_000 } });
    await db.lensPackagePrice.create({ data: { lensTypeId: type.id, lensIndexId: idx2.id, price: 140_000 } });
    const ar = await db.lensOption.create({ data: { key: "AR", name: "AR", group: "COATING", price: 25_000 } });
    return { type, idx, idx2, ar };
  }

  it("prices lenses on the server, requires verified prescriptions before lens preparation, supports pickup", async () => {
    const branch = await makeBranch({ pickupEnabled: true });
    const p = await makeProduct({ price: 200_000 });
    await stock(branch.id, p.variants[0].id, 3);
    const lens = await lensSetup();
    const customer = await makeCustomer();
    const strongRx = await db.prescription.create({ data: { customerId: customer.customerId, label: "قوية", odSph: -650, osSph: -600, pd: 620 } });

    // 1.50 cannot handle -6.50: the server rejects it.
    const badCart = await makeCart([{ variantId: p.variants[0].id, quantity: 1, lensTypeId: lens.type.id, lensIndexId: lens.idx.id, prescriptionId: strongRx.id, prescriptionMode: "SAVED" }], customer.customerId);
    await expect(
      placeOrder({ actor: customer, customerId: customer.customerId, cartToken: badCart.token }, { idempotencyKey: key(), contactName: "س", contactPhone: "01012345678", fulfillmentType: "PICKUP", pickupBranchId: branch.id, paymentMethod: "PAY_AT_BRANCH", prescriptionConfirmed: "on" }),
    ).rejects.toThrow(/معامل انكسار/);
    await db.cart.update({ where: { id: badCart.id }, data: { status: "ABANDONED" } });

    const cart = await makeCart([{ variantId: p.variants[0].id, quantity: 1, lensTypeId: lens.type.id, lensIndexId: lens.idx2.id, lensOptionIds: [lens.ar.id], prescriptionId: strongRx.id, prescriptionMode: "SAVED" }], customer.customerId);
    const base = { idempotencyKey: key(), contactName: "س", contactPhone: "01012345678", fulfillmentType: "PICKUP" as const, pickupBranchId: branch.id, paymentMethod: "PAY_AT_BRANCH" as const };
    await expect(placeOrder({ actor: customer, customerId: customer.customerId, cartToken: cart.token }, base)).rejects.toThrow(/تأكيد/);
    const r = await placeOrder({ actor: customer, customerId: customer.customerId, cartToken: cart.token }, { ...base, idempotencyKey: key(), prescriptionConfirmed: "on" });

    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: true } });
    expect(order.status).toBe("PRESCRIPTION_REVIEW");
    expect(order.total).toBe(200_000 + 140_000 + 25_000);
    expect(order.items[0].lensUnitPrice).toBe(165_000);
    expect(order.items[0].returnable).toBe(false);
    expect((order.items[0].prescriptionSnapshot as { values: { odSph: number } }).values.odSph).toBe(-650);

    await expect(transitionOrder(ops, order.id, { to: "LENS_PREPARATION" })).rejects.toThrow(/اعتماد الوصفات/);
    await reviewPrescription(ops, strongRx.id, { decision: "VERIFIED" });
    await transitionOrder(ops, order.id, { to: "LENS_PREPARATION" });
    await transitionOrder(ops, order.id, { to: "READY" });
    await transitionOrder(ops, order.id, { to: "READY_FOR_PICKUP" });
    expect(await onHand(branch.id, p.variants[0].id)).toEqual({ onHand: 3, reserved: 1 });
    await expect(transitionOrder(ops, order.id, { to: "DELIVERED" })).rejects.toThrow(/تحصيل/);
    await transitionOrder(ops, order.id, { to: "DELIVERED", collectPayment: "on" });
    const done = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(done.paymentStatus).toBe("PAID");
    expect(done.paidTotal).toBe(done.total);
    expect(await onHand(branch.id, p.variants[0].id)).toEqual({ onHand: 2, reserved: 0 });

    // Custom prescription lenses are not returnable by default.
    await expect(createReturn(customer, { orderId: order.id, reason: "غير مناسب", items: [{ orderItemId: order.items[0].id, quantity: 1 }] })).rejects.toThrow(/غير قابلة للإرجاع/);
    await assertLedgerConsistent();
  });

  it("runs request → review → receive → inspect → refund for returns, with restock and damage traceability", async () => {
    const branch = await makeBranch();
    const p1 = await makeProduct({ price: 100_000 });
    const p2 = await makeProduct({ price: 50_000 });
    await stock(branch.id, p1.variants[0].id, 5);
    await stock(branch.id, p2.variants[0].id, 5);
    const customer = await makeCustomer();
    const rate = await makeShipping();
    const cart = await makeCart([{ variantId: p1.variants[0].id, quantity: 2 }, { variantId: p2.variants[0].id, quantity: 1 }], customer.customerId);
    const r = await placeOrder({ actor: customer, customerId: customer.customerId, cartToken: cart.token }, { idempotencyKey: key(), contactName: "س", contactPhone: "01012345678", fulfillmentType: "DELIVERY", shippingRateId: rate.id, address, paymentMethod: "COD" });
    for (const to of ["READY"] as const) await transitionOrder(ops, r.orderId, { to });
    await transitionOrder(ops, r.orderId, { to: "SHIPPED", carrier: "Aramex" });
    await transitionOrder(ops, r.orderId, { to: "DELIVERED", collectPayment: "on" });
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { items: true } });
    const i1 = order.items.find((i) => i.variantId === p1.variants[0].id)!;
    const i2 = order.items.find((i) => i.variantId === p2.variants[0].id)!;

    await expect(createReturn(customer, { orderId: order.id, reason: "مقاس", items: [{ orderItemId: i1.id, quantity: 3 }] })).rejects.toThrow(/الكمية المتاحة/);
    const ret = await createReturn(customer, { orderId: order.id, reason: "لم يعجبني اللون", items: [{ orderItemId: i1.id, quantity: 1 }, { orderItemId: i2.id, quantity: 1 }] });
    await expect(createReturn(customer, { orderId: order.id, reason: "تكرار", items: [{ orderItemId: i2.id, quantity: 1 }] })).rejects.toThrow(/الكمية المتاحة/);

    await reviewReturn(ops, ret.id, "APPROVED");
    await receiveReturn(ops, ret.id, branch.id);
    const items = await db.returnItem.findMany({ where: { returnId: ret.id } });
    await inspectReturn(ops, ret.id, {
      items: items.map((it) => ({ returnItemId: it.id, restockDecision: it.orderItemId === i1.id ? ("RESTOCK" as const) : ("DAMAGED" as const) })),
    });
    expect(await onHand(branch.id, p1.variants[0].id)).toEqual({ onHand: 4, reserved: 0 });
    expect(await onHand(branch.id, p2.variants[0].id)).toEqual({ onHand: 4, reserved: 0 });

    await completeReturn(owner, ret.id);
    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.refundedTotal).toBe(150_000);
    expect(after.paymentStatus).toBe("PARTIALLY_REFUNDED");
    const finalRet = await db.returnRequest.findUniqueOrThrow({ where: { id: ret.id } });
    expect(finalRet.status).toBe("COMPLETED");
    const loyalty = await db.loyaltyAccount.findUniqueOrThrow({ where: { customerId: customer.customerId } });
    expect(loyalty.balance).toBeLessThan(2500);
    const movementTypes = (await db.inventoryMovement.findMany({ where: { referenceId: ret.id } })).map((m) => m.type).sort();
    expect(movementTypes).toEqual(["DAMAGE", "RETURN_RESTOCK", "RETURN_RESTOCK"]);
    await assertLedgerConsistent();
  });
});
