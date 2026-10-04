import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adjustStock, listStock } from "@/modules/inventory/service";
import { transitionOrder, getOrderForStaff, getOrderForCustomer } from "@/modules/orders/service";
import { refundPayment } from "@/modules/payments/service";
import { saveRole, createStaff } from "@/modules/staff/service";
import { staffGetPrescription } from "@/modules/prescriptions/service";
import { placeOrder } from "@/modules/checkout/service";
import { saveProduct } from "@/modules/catalog/service";
import { address, key, makeBranch, makeCart, makeCustomer, makeProduct, makeShipping, resetDb, staffActor, stock } from "../support/fixtures";

describe("authorization is enforced in services, not just the UI", () => {
  beforeEach(resetDb);

  it("blocks staff without the permission", async () => {
    const branch = await makeBranch();
    const p = await makeProduct();
    const sales = staffActor("sales");
    await expect(adjustStock(sales, { branchId: branch.id, variantId: p.variants[0].id, mode: "delta", value: 5, reason: "تجربة" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(refundPayment(sales, { paymentId: "x", amount: "10", reason: "abc" })).rejects.toThrow();
    const analyst = staffActor("analytics_viewer");
    await expect(listStock(analyst, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("restricts branch-scoped staff to their branches", async () => {
    const mine = await makeBranch();
    const other = await makeBranch();
    const p = await makeProduct();
    const manager = staffActor("branch_manager", { branchIds: [mine.id] });
    await adjustStock(manager, { branchId: mine.id, variantId: p.variants[0].id, mode: "delta", value: 3, reason: "استلام" });
    await expect(adjustStock(manager, { branchId: other.id, variantId: p.variants[0].id, mode: "delta", value: 3, reason: "استلام" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await stock(other.id, p.variants[0].id, 5);
    const rate = await makeShipping();
    await db.branch.update({ where: { id: mine.id }, data: { shipsOnline: false } });
    const cart = await makeCart([{ variantId: p.variants[0].id, quantity: 1 }]);
    const order = await placeOrder({ actor: null, customerId: null, cartToken: cart.token }, { idempotencyKey: key(), contactName: "س", contactPhone: "01012345678", fulfillmentType: "DELIVERY", shippingRateId: rate.id, address, paymentMethod: "COD" });
    await expect(getOrderForStaff(manager, order.orderId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(transitionOrder(manager, order.orderId, { to: "READY" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("prevents privilege escalation through roles and staff management", async () => {
    const ops = staffActor("operations_manager", { extra: ["roles.write", "staff.write"] });
    await expect(saveRole(ops, null, { key: "sneaky", name: "x", permissions: ["settings.write"] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ownerRole = await db.role.create({ data: { key: "owner", name: "Owner", isSystem: true, permissions: { create: [{ permission: "settings.write" }] } } });
    await expect(
      createStaff(ops, { name: "x", email: "x@y.com", employeeCode: "E-1", password: "longpassword1", roleIds: [ownerRole.id], allBranches: "on", isActive: "on" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires catalog.price to change prices", async () => {
    const p = await makeProduct();
    const writer = staffActor("marketing", { extra: ["catalog.write"] });
    await expect(
      saveProduct(writer, p.id, { slug: p.slug, name: p.name, type: "FRAME", status: "ACTIVE", variants: [{ id: p.variants[0].id, sku: p.variants[0].sku, price: "1", isActive: "on" }] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("audits every staff prescription view and hides other customers' orders", async () => {
    const c1 = await makeCustomer();
    const c2 = await makeCustomer();
    const rx = await db.prescription.create({ data: { customerId: c1.customerId, label: "x", odSph: -200, osSph: -150, pd: 630 } });
    await expect(staffGetPrescription(staffActor("marketing"), rx.id, "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await staffGetPrescription(staffActor("sales"), rx.id, "مراجعة الطلب");
    expect(await db.auditLog.count({ where: { action: "prescription.view", entityId: rx.id } })).toBe(1);

    const branch = await makeBranch();
    const p = await makeProduct();
    await stock(branch.id, p.variants[0].id, 2);
    const rate = await makeShipping();
    const cart = await makeCart([{ variantId: p.variants[0].id, quantity: 1 }], c1.customerId);
    const o = await placeOrder({ actor: c1, customerId: c1.customerId, cartToken: cart.token }, { idempotencyKey: key(), contactName: "س", contactPhone: "01012345678", fulfillmentType: "DELIVERY", shippingRateId: rate.id, address, paymentMethod: "COD" });
    await expect(getOrderForCustomer(c2.customerId, o.number)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const own = await getOrderForCustomer(c1.customerId, o.number);
    expect(own.items[0]).not.toHaveProperty("unitCost");
  });

  it("rejects edits to append-only ledgers at the database level", async () => {
    const branch = await makeBranch();
    const p = await makeProduct();
    await stock(branch.id, p.variants[0].id, 2);
    await expect(db.inventoryMovement.updateMany({ data: { quantity: 99 } })).rejects.toThrow(/append-only/);
    await expect(db.inventoryMovement.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(db.$executeRaw`UPDATE "inventory_item" SET "onHand" = -1`).rejects.toThrow();
  });
});
