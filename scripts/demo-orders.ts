/**
 * Development-only: generates realistic demo orders by running the real cart → checkout → payment →
 * fulfilment services (no direct inserts), so dashboards and reports have data to show.
 * Usage: npm run db:demo -- 25
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { ensureCart, addToCart } from "@/modules/cart/service";
import { placeOrder } from "@/modules/checkout/service";
import { transitionOrder } from "@/modules/orders/service";
import { loadStaffActor } from "@/server/auth/load-actor";

if (process.env.NODE_ENV === "production") throw new Error("demo-orders must not run in production");

const NAMES = ["أحمد علي", "منة الله حسن", "يوسف إبراهيم", "سارة محمود", "عمر خالد", "نور الهدى سامي", "كريم مصطفى", "هبة عادل"];
const GOVS = [["القاهرة", "مدينة نصر"], ["الجيزة", "الدقي"], ["الإسكندرية", "سموحة"]];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

async function main() {
  const count = Number(process.argv[2] ?? 20);
  const owner = await db.user.findFirst({ where: { email: "owner@shams.example" } });
  if (!owner) throw new Error("Run the seed first");
  const actor = await loadStaffActor(owner.id);
  if (!actor) throw new Error("Owner has no staff profile");
  const variants = await db.productVariant.findMany({ where: { isActive: true, product: { status: "ACTIVE" }, inventory: { some: { onHand: { gt: 2 } } } }, select: { id: true } });
  const branches = await db.branch.findMany({ where: { pickupEnabled: true, isActive: true } });
  let ok = 0;
  for (let i = 0; i < count; i++) {
    const cart = await ensureCart({ token: null });
    for (const v of [pick(variants), ...(Math.random() < 0.3 ? [pick(variants)] : [])]) await addToCart(cart.id, null, { variantId: v.id, quantity: 1 }).catch(() => {});
    const pickup = Math.random() < 0.35;
    const [gov, area] = pick(GOVS);
    const rate = await db.shippingRate.findFirst({ where: { isActive: true, zone: { governorates: { has: gov } } } });
    const name = pick(NAMES);
    try {
      const res = await placeOrder(
        { actor: null, customerId: null, cartToken: cart.token },
        pickup
          ? { idempotencyKey: randomUUID(), contactName: name, contactPhone: `010${String(10000000 + i * 7919).slice(0, 8)}`, fulfillmentType: "PICKUP", pickupBranchId: pick(branches).id, paymentMethod: "PAY_AT_BRANCH" }
          : { idempotencyKey: randomUUID(), contactName: name, contactPhone: `011${String(20000000 + i * 104729).slice(0, 8)}`, fulfillmentType: "DELIVERY", shippingRateId: rate?.id, paymentMethod: "COD", address: { fullName: name, phone: "01012345678", governorate: gov, city: area, area, street: "شارع التحرير", building: String(10 + i) } },
      );
      ok++;
      // Move a share of orders through fulfilment so every status appears.
      const steps = pickup ? ["READY", "READY_FOR_PICKUP", "DELIVERED"] : ["READY", "SHIPPED", "DELIVERED"];
      const depth = Math.floor(Math.random() * (steps.length + 1));
      for (const to of steps.slice(0, depth)) {
        await transitionOrder(actor, res.orderId, { to: to as never, carrier: "Bosta", trackingNumber: `BX${i}`, collectPayment: to === "DELIVERED" });
      }
      if (Math.random() < 0.08 && depth === 0) await transitionOrder(actor, res.orderId, { to: "CANCELLED", reason: "طلب العميل الإلغاء" });
    } catch (err) {
      console.warn("skipped:", (err as Error).message);
    }
  }
  console.log(`placed ${ok} demo orders`);
}

main().finally(() => db.$disconnect());
