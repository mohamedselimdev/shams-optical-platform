import { notFound } from "next/navigation";
import { requireCustomerPage } from "@/server/auth/session";
import { isDomainError } from "@/server/errors";
import { getOrderForCustomer } from "@/modules/orders/service";
import { customerReturnOptions } from "@/modules/returns/service";
import { FULFILLMENT_LABELS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, RETURN_STATUS_LABELS } from "@/i18n/labels";
import { orderTone } from "@/i18n/tones";
import { ActionForm } from "@/ui/action-form";
import { SelectField, TextArea } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, DateText, Money } from "@/ui/primitives";
import { requestReturnAction } from "../../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("تفاصيل الطلب") };
}

export default async function MyOrder({ params }: { params: Promise<{ number: string }> }) {
  const t = await getT();
  const { number } = await params;
  const actor = await requireCustomerPage(`/account/orders/${number}`);
  const order = await getOrderForCustomer(actor.customerId, decodeURIComponent(number)).catch((e) => {
    if (isDomainError(e) && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const policy = await customerReturnOptions(order);
  const returnable = order.items.filter((i) => policy.itemIds.includes(i.id));
  const canReturn = returnable.length > 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold">{t("طلب")}{" "}<span className="num" dir="ltr">{order.number}</span></h1>
        <Badge tone={orderTone[order.status]}>{t(ORDER_STATUS_LABELS[order.status])}</Badge>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <dl className="space-y-2 rounded-lg border border-line bg-surface p-5 text-sm">
          <div className="flex justify-between"><dt className="text-ink-muted">{t("تاريخ الطلب")}</dt><dd><DateText value={order.placedAt} withTime /></dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">{t("الدفع")}</dt><dd>{t(PAYMENT_METHOD_LABELS[order.paymentMethod])} · {t(PAYMENT_STATUS_LABELS[order.paymentStatus])}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">{t("الاستلام")}</dt><dd>{t(FULFILLMENT_LABELS[order.fulfillmentType])}</dd></div>
          {order.pickupBranch ? <div className="flex justify-between gap-4"><dt className="text-ink-muted">{t("الفرع")}</dt><dd className="text-end">{order.pickupBranch.name}<span className="block text-xs text-ink-muted">{order.pickupBranch.addressLine}</span></dd></div> : null}
          {order.shipments.map((s, i) => <div key={i} className="flex justify-between"><dt className="text-ink-muted">{t("الشحن")}</dt><dd>{s.carrier}{s.trackingNumber ? <span className="num ms-1" dir="ltr">#{s.trackingNumber}</span> : null}</dd></div>)}
          {order.returns.map((r) => <div key={r.id} className="flex justify-between"><dt className="text-ink-muted">{t("مرتجع")}{" "}<span className="num" dir="ltr">{r.number}</span></dt><dd>{t(RETURN_STATUS_LABELS[r.status])}</dd></div>)}
        </dl>
        <section className="rounded-lg border border-line bg-surface p-5 text-sm">
          <h2 className="mb-3 font-semibold">{t("مراحل الطلب")}</h2>
          <ol className="space-y-3 border-s border-line ps-4">
            {order.events.map((e) => (
              <li key={e.id} className="relative">
                <span className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-sun-400" aria-hidden />
                <p className="font-medium">{e.toStatus ? t(ORDER_STATUS_LABELS[e.toStatus]) : t.message(e.message ?? "")}</p>
                {e.toStatus && e.message ? <p className="text-ink-muted">{t.message(e.message)}</p> : null}
                <p className="text-xs text-ink-faint"><DateText value={e.createdAt} withTime /></p>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <section className="rounded-lg border border-line bg-surface p-5 text-sm">
        <ul className="divide-y divide-line">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-2">
              <span>{i.productName}{i.variantName ? ` (${i.variantName})` : ""} <span className="num text-ink-muted">×{i.quantity}</span>
                {i.lensSnapshot ? <span className="block text-xs text-ink-muted">{t("مع عدسات حسب الوصفة")}</span> : null}
              </span>
              <Money value={i.lineTotal} />
            </li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-line pt-3">
          {order.discountTotal ? <div className="flex justify-between text-success"><dt>{t("الخصم")}</dt><dd>−<Money value={order.discountTotal} /></dd></div> : null}
          {order.loyaltyDiscount ? <div className="flex justify-between text-success"><dt>{t("نقاط الولاء")}</dt><dd>−<Money value={order.loyaltyDiscount} /></dd></div> : null}
          {order.shippingTotal ? <div className="flex justify-between"><dt>{t("الشحن")}</dt><dd><Money value={order.shippingTotal} /></dd></div> : null}
          {order.codFee ? <div className="flex justify-between"><dt>{t("رسوم الدفع عند الاستلام")}</dt><dd><Money value={order.codFee} /></dd></div> : null}
          <div className="flex justify-between font-semibold"><dt>{t("الإجمالي")}</dt><dd><Money value={order.total} /></dd></div>
          {order.refundedTotal ? <div className="flex justify-between text-ink-muted"><dt>{t("تم استرداد")}</dt><dd><Money value={order.refundedTotal} /></dd></div> : null}
        </dl>
      </section>
      {canReturn ? (
        <section className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-1 font-semibold">{t("طلب إرجاع")}</h2>
          <p className="mb-4 text-sm text-ink-muted">{t("متاح خلال {0} يوماً من الاستلام. العدسات المصنّعة حسب الوصفة غير قابلة للإرجاع.", [policy.windowDays])}</p>
          <ActionForm action={requestReturnAction} className="space-y-4">
            <input type="hidden" name="orderId" value={order.id} />
            <ul className="space-y-2 text-sm">
              {returnable.map((i, n) => (
                <li key={i.id} className="flex items-center justify-between gap-3">
                  <span>{i.productName}{i.variantName ? ` (${i.variantName})` : ""}</span>
                  <input type="hidden" name={`items.${n}.orderItemId`} value={i.id} />
                  <select name={`items.${n}.quantity`} defaultValue="0" aria-label={t("كمية الإرجاع: {0}", [i.productName])} className="h-9 rounded-md border border-line-strong bg-surface px-2">
                    {Array.from({ length: i.quantity - i.returnedQuantity + 1 }, (_, q) => <option key={q} value={q}>{q}</option>)}
                  </select>
                </li>
              ))}
            </ul>
            <SelectField label={t("المطلوب")} name="resolution" options={[{ value: "REFUND", label: t("استرداد المبلغ") }, { value: "EXCHANGE", label: t("استبدال") }]} />
            <TextArea label={t("سبب الإرجاع")} name="reason" required rows={2} />
            <SubmitButton>{t("إرسال الطلب")}</SubmitButton>
          </ActionForm>
        </section>
      ) : null}
    </div>
  );
}
