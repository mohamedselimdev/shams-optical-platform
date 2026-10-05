import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getCustomerActor } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { currentCart } from "@/server/storefront";
import { GOVERNORATES } from "@/lib/egypt";
import { buildQuote } from "@/modules/checkout/quote";
import { providerForMethod } from "@/modules/payments/registry";
import { listPublicBranches } from "@/modules/branches/service";
import { CheckoutForm } from "@/components/store/checkout-form";
import { TrackOnMount } from "@/components/store/track-on-mount";
import { Money } from "@/ui/primitives";
import { placeOrderAction } from "./actions";
import { getT } from "@/i18n/server";
import { localizeContent } from "@/i18n/localize";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("إتمام الشراء"), robots: { index: false } };
}

export default async function CheckoutPage() {
  const t = await getT();
  const [cart, actor, checkout, loyaltySettings] = await Promise.all([currentCart(), getCustomerActor(), getSetting("checkout"), getSetting("loyalty")]);
  if (!cart || cart.items.length === 0) redirect("/cart");
  // Display copy with catalog names in the visitor's language; totals are unaffected.
  const quote = localizeContent(await buildQuote(db, cart, { customerId: actor?.customerId ?? null, couponCode: cart.couponCode, fulfillmentType: "PICKUP" }), t.locale);
  if (quote.issues.length) redirect("/cart");

  const [branches, zones, customer, loyalty] = await Promise.all([
    listPublicBranches(),
    db.shippingZone.findMany({ where: { isActive: true }, include: { rates: { where: { isActive: true }, orderBy: { price: "asc" } } } }),
    actor ? db.customer.findUnique({ where: { id: actor.customerId }, include: { addresses: { orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] } } }) : null,
    actor ? db.loyaltyAccount.findUnique({ where: { customerId: actor.customerId } }) : null,
  ]);

  // Which pickup branches can supply the whole cart right now (same rule placeOrder enforces).
  const need = new Map<string, number>();
  for (const i of cart.items) need.set(i.variantId, (need.get(i.variantId) ?? 0) + i.quantity);
  const canSupply = (branchId: string) =>
    [...need].every(([variantId, q]) => {
      const inv = cart.items.find((i) => i.variantId === variantId)?.variant.inventory.find((x) => x.branchId === branchId);
      return (inv ? inv.onHand - inv.reserved : 0) >= q;
    });

  const card = checkout.cardEnabled ? providerForMethod("CARD") : null;
  const wallet = checkout.walletEnabled ? providerForMethod("WALLET") : null;
  const methods = [
    ...(card ? [{ value: "CARD" as const, label: t("بطاقة بنكية (فيزا / ماستركارد / ميزة)"), hint: t("الدفع على صفحة آمنة لمزود الدفع؛ لا نخزن بيانات بطاقتك."), sandbox: card.sandbox }] : []),
    ...(wallet ? [{ value: "WALLET" as const, label: t("محفظة إلكترونية"), hint: t("فودافون كاش وغيرها عبر مزود الدفع."), sandbox: wallet.sandbox }] : []),
    ...(checkout.codEnabled ? [{ value: "COD" as const, label: t("الدفع عند الاستلام"), hint: t("ادفع نقداً للمندوب عند التوصيل.") }] : []),
    ...(checkout.payAtBranchEnabled ? [{ value: "PAY_AT_BRANCH" as const, label: t("الدفع في الفرع"), hint: t("ادفع عند استلام طلبك من الفرع.") }] : []),
  ];
  const merchandiseTotal = quote.pricing.subtotal - quote.pricing.merchandiseDiscount;

  return (
    <div className="container-page py-10">
      <TrackOnMount event={{ name: "checkout_started", value: quote.pricing.total }} />
      <h1 className="mb-8 font-display text-3xl font-semibold">{t("إتمام الشراء")}</h1>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <CheckoutForm
          action={placeOrderAction}
          idempotencyKey={`web_${randomUUID()}`}
          governorates={GOVERNORATES}
          branches={branches.filter((b) => b.pickupEnabled).map((b) => ({ id: b.id, name: b.name, address: t("{0}، {1}", [b.addressLine, b.city]), available: canSupply(b.id) }))}
          rates={zones.flatMap((z) => z.rates.map((r) => ({ id: r.id, name: r.name, price: r.price, freeOverTotal: r.freeOverTotal, codAllowed: r.codAllowed, codFee: r.codFee, minDays: r.minDays, maxDays: r.maxDays, governorates: z.governorates })))}
          addresses={(customer?.addresses ?? []).map((a) => ({ id: a.id, label: t("{0}{1}، {2}، {3}", [a.label ? `${a.label}: ` : "", a.street, a.city, t(a.governorate)]), governorate: a.governorate }))}
          methods={methods}
          codMaxTotal={checkout.codMaxTotal}
          merchandiseTotal={merchandiseTotal}
          requiresPrescription={quote.requiresPrescription}
          contact={{ name: customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") : "", email: customer?.email ?? "", phone: customer?.phone ?? "" }}
          loyalty={actor && loyaltySettings.enabled ? { balance: loyalty?.balance ?? 0, pointValue: loyaltySettings.pointValuePiasters, minRedeem: loyaltySettings.minRedeemPoints } : null}
        />
        <aside className="h-fit rounded-lg border border-line bg-surface p-5 lg:sticky lg:top-24">
          <h2 className="mb-4 font-semibold">{t("طلبك")}</h2>
          <ul className="space-y-3 text-sm">
            {quote.lines.map((l) => (
              <li key={l.item.id} className="flex justify-between gap-3">
                <span>
                  {l.item.variant.product.name} <span className="num text-ink-muted">×{l.item.quantity}</span>
                  {l.lens ? <span className="block text-xs text-ink-muted">+ {l.lens.type.name} ({l.lens.index.name})</span> : null}
                </span>
                <Money value={quote.pricing.lines.find((p) => p.key === l.item.id)?.lineSubtotal ?? 0} />
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt>{t("المجموع")}</dt><dd><Money value={quote.pricing.subtotal} /></dd></div>
            {quote.pricing.applied.filter((a) => a.amount > 0).map((a) => (
              <div key={a.id} className="flex justify-between text-success"><dt>{a.name}</dt><dd>−<Money value={a.amount} /></dd></div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}
