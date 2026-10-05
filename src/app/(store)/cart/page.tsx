import Link from "next/link";
import { db } from "@/server/db";
import { getCustomerActor } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { currentCart } from "@/server/storefront";
import { buildQuote } from "@/modules/checkout/quote";
import { couponMessage } from "@/modules/checkout/service";
import { formatDiopter } from "@/lib/optics";
import { RX_MODE_LABELS } from "@/i18n/labels";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { ButtonLink } from "@/ui/button";
import { EmptyState, Money } from "@/ui/primitives";
import { couponAction, updateLineAction } from "./actions";
import { getT } from "@/i18n/server";
import { localizeContent } from "@/i18n/localize";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("سلة التسوق"), robots: { index: false } };
}

export default async function CartPage() {
  const t = await getT();
  const [cart, actor, checkout] = await Promise.all([currentCart(), getCustomerActor(), getSetting("checkout")]);
  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState title={t("سلتك فارغة")} description={t("تصفح الإطارات والنظارات الشمسية وأضف ما يعجبك.")} action={<ButtonLink href="/shop">{t("تسوّق الآن")}</ButtonLink>} />
      </div>
    );
  }
  // Display-only quote (pickup, no shipping yet). Checkout recomputes everything inside the order transaction.
  // Display copy with catalog names in the visitor's language; totals are unaffected.
  const quote = localizeContent(await buildQuote(db, cart, { customerId: actor?.customerId ?? null, couponCode: cart.couponCode, fulfillmentType: "PICKUP" }), t.locale);
  const priced = new Map(quote.pricing.lines.map((l) => [l.key, l]));

  return (
    <div className="container-page py-10">
      <h1 className="mb-8 font-display text-3xl font-semibold">{t("سلة التسوق")}</h1>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {quote.lines.map((l) => {
            const v = l.item.variant;
            const p = priced.get(l.item.id);
            const variantName = [v.colorName, v.sizeLabel].filter(Boolean).join(" / ");
            return (
              <li key={l.item.id} className="flex gap-4 p-4">
                <Link href={`/p/${v.product.slug}`} className="h-24 w-32 shrink-0 overflow-hidden rounded-md border border-line bg-surface-2">
                  {v.product.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- product media thumbnail.
                    <img src={v.product.images[0].url} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </Link>
                <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
                  <div className="flex justify-between gap-3">
                    <div>
                      {v.product.brand ? <p className="text-xs text-ink-muted">{v.product.brand.name}</p> : null}
                      <Link href={`/p/${v.product.slug}`} className="font-medium hover:underline">{v.product.name}</Link>
                      {variantName ? <p className="text-ink-muted">{variantName}</p> : null}
                    </div>
                    {p ? <Money value={p.lineSubtotal} className="font-semibold" /> : null}
                  </div>
                  {l.lens ? (
                    <div className="rounded-md bg-surface-2 p-2 text-xs text-ink-soft">
                      <p>{t("عدسات:")}{" "}{l.lens.type.name} · {l.lens.index.name}{l.lens.options.length ? ` · ${l.lens.options.map((o) => o.name).join(t("، "))}` : ""} (<Money value={l.lens.unitPrice} />)</p>
                      {l.item.prescriptionMode !== "NONE" ? (
                        <p className="mt-1">{t("الوصفة:")}{" "}{t(RX_MODE_LABELS[l.item.prescriptionMode])}{l.prescription ? ` — ${l.prescription.label}` : ""}
                          {l.prescription && l.prescription.values.odSph !== null && l.prescription.values.odSph !== undefined ? (
                            <span className="num ms-1" dir="ltr">(OD {formatDiopter(l.prescription.values.odSph as number)} / OS {formatDiopter((l.prescription.values.osSph as number | null) ?? null)})</span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {l.problem ? <p className="text-danger" role="alert">{l.problem}</p> : null}
                  <div className="mt-auto flex items-center gap-3 pt-2">
                    <ActionForm action={updateLineAction} showSuccess={false} className="flex items-center gap-2">
                      <input type="hidden" name="itemId" value={l.item.id} />
                      <label className="sr-only" htmlFor={`q-${l.item.id}`}>{t("الكمية")}</label>
                      <select id={`q-${l.item.id}`} name="quantity" defaultValue={String(l.item.quantity)} className="h-8 rounded-md border border-line-strong bg-surface px-2">
                        {Array.from({ length: Math.max(checkout.maxQuantityPerLine, l.item.quantity) }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                      </select>
                      <SubmitButton size="sm" variant="ghost" pendingLabel="…">{t("تحديث")}</SubmitButton>
                    </ActionForm>
                    <ActionForm action={updateLineAction} showSuccess={false}>
                      <input type="hidden" name="itemId" value={l.item.id} />
                      <input type="hidden" name="quantity" value="0" />
                      <SubmitButton size="sm" variant="ghost" pendingLabel="…" className="text-danger">{t("حذف")}</SubmitButton>
                    </ActionForm>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="space-y-4">
          <div className="rounded-lg border border-line bg-surface p-5">
            <h2 className="mb-4 font-semibold">{t("ملخص الطلب")}</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>{t("المجموع")}</dt><dd><Money value={quote.pricing.subtotal} /></dd></div>
              {quote.pricing.applied.map((a) => (
                <div key={a.id} className="flex justify-between text-success"><dt>{a.name}</dt><dd>−<Money value={a.amount} /></dd></div>
              ))}
              <div className="flex justify-between text-ink-muted"><dt>{t("الشحن")}</dt><dd>{t("يُحسب عند الدفع")}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>{t("الإجمالي")}</dt><dd><Money value={quote.pricing.total} /></dd></div>
            </dl>
            {quote.issues.length ? <p className="mt-3 text-sm text-danger">{t("يرجى تعديل المنتجات غير المتاحة قبل المتابعة.")}</p> : null}
            <ButtonLink href="/checkout" size="lg" className="mt-5 w-full" aria-disabled={quote.issues.length > 0}>{t("إتمام الشراء")}</ButtonLink>
          </div>
          <div className="rounded-lg border border-line bg-surface p-5">
            <ActionForm action={couponAction} showSuccess={false} className="space-y-2">
              <label htmlFor="coupon" className="text-sm font-medium">{t("كوبون الخصم")}</label>
              <div className="flex gap-2">
                <input id="coupon" name="code" defaultValue={cart.couponCode ?? ""} dir="ltr" className="h-10 flex-1 rounded-md border border-line-strong bg-surface px-3 text-sm uppercase" />
                <SubmitButton variant="secondary" pendingLabel="…">{t("تطبيق")}</SubmitButton>
              </div>
              {cart.couponCode ? (
                <p className={`text-xs ${quote.pricing.couponStatus === "applied" ? "text-success" : "text-danger"}`}>
                  {quote.pricing.couponStatus === "applied" ? t("تم تطبيق {0}", [cart.couponCode]) : t.message(couponMessage(quote.pricing.couponStatus))}
                  {" "}<button name="remove" value="1" className="underline">{t("إزالة")}</button>
                </p>
              ) : null}
            </ActionForm>
          </div>
        </aside>
      </div>
    </div>
  );
}
