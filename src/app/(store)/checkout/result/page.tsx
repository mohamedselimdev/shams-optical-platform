import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { findShopperOrder } from "@/server/storefront";
import { FULFILLMENT_LABELS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@/i18n/labels";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { ButtonLink } from "@/ui/button";
import { Money } from "@/ui/primitives";
import { retryPaymentAction } from "../actions";
import { AutoRefresh } from "./auto-refresh";

export const metadata = { title: "حالة الطلب", robots: { index: false } };

/**
 * Landing page after checkout and after the payment provider redirects back. The provider's return
 * parameters are ignored: what is shown comes from the database, which only webhooks update.
 */
export default async function ResultPage({ searchParams }: { searchParams: Promise<{ order?: string; payment?: string }> }) {
  const sp = await searchParams;
  if (!sp.order) notFound();
  const order = await findShopperOrder(sp.order.slice(0, 40));
  if (!order) notFound();
  const latest = order.payments[0];
  const awaitingPayment = order.status === "PENDING_PAYMENT";
  const failed = awaitingPayment && (sp.payment === "failed" || latest?.status === "FAILED" || latest?.status === "CANCELLED");
  const confirming = awaitingPayment && !failed && latest?.status === "PENDING";
  const cancelled = order.status === "CANCELLED";

  return (
    <div className="container-page max-w-3xl py-12">
      {confirming ? <AutoRefresh /> : null}
      <div className="rounded-xl border border-line bg-surface p-8 text-center">
        {cancelled ? <XCircle className="mx-auto h-12 w-12 text-danger" aria-hidden /> : awaitingPayment ? (failed ? <XCircle className="mx-auto h-12 w-12 text-danger" aria-hidden /> : <Clock className="mx-auto h-12 w-12 text-warning" aria-hidden />) : <CheckCircle2 className="mx-auto h-12 w-12 text-success" aria-hidden />}
        <h1 className="mt-4 font-display text-2xl font-semibold" aria-live="polite">
          {cancelled ? "تم إلغاء الطلب" : failed ? "لم تكتمل عملية الدفع" : confirming ? "جارٍ تأكيد الدفع…" : awaitingPayment ? "بانتظار الدفع" : "شكراً لك! تم استلام طلبك"}
        </h1>
        <p className="mt-2 text-ink-muted">رقم الطلب <span className="num font-semibold text-ink" dir="ltr">{order.number}</span></p>
        {failed ? (
          <div className="mx-auto mt-6 max-w-sm space-y-2">
            <p className="text-sm text-ink-muted">لم يتم خصم أي مبلغ. المنتجات محجوزة لك لفترة قصيرة، يمكنك المحاولة مرة أخرى.</p>
            <ActionForm action={retryPaymentAction}>
              <input type="hidden" name="order" value={order.number} />
              <SubmitButton size="lg" className="w-full" pendingLabel="جارٍ التحويل…">إعادة محاولة الدفع</SubmitButton>
            </ActionForm>
          </div>
        ) : confirming && latest?.redirectUrl ? (
          <p className="mt-4 text-sm text-ink-muted">لم تُكمل الدفع بعد؟ <a href={latest.redirectUrl} className="font-medium text-ink underline">العودة إلى صفحة الدفع</a></p>
        ) : null}
      </div>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <dl className="space-y-2 rounded-lg border border-line bg-surface p-5 text-sm">
          <div className="flex justify-between"><dt className="text-ink-muted">الحالة</dt><dd>{ORDER_STATUS_LABELS[order.status]}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">الدفع</dt><dd>{PAYMENT_METHOD_LABELS[order.paymentMethod]} · {PAYMENT_STATUS_LABELS[order.paymentStatus]}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-muted">الاستلام</dt><dd>{FULFILLMENT_LABELS[order.fulfillmentType]}</dd></div>
          {order.pickupBranch ? <div className="flex justify-between gap-4"><dt className="text-ink-muted">الفرع</dt><dd className="text-end">{order.pickupBranch.name}<span className="block text-xs text-ink-muted">{order.pickupBranch.addressLine}، {order.pickupBranch.city}</span></dd></div> : null}
          {order.requiresPrescription ? <p className="rounded-md bg-info-soft p-2 text-info">سيراجع أخصائي البصريات وصفتك قبل تصنيع العدسات، وسنبلغك بأي استفسار.</p> : null}
        </dl>
        <div className="rounded-lg border border-line bg-surface p-5 text-sm">
          <ul className="space-y-2">
            {order.items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3"><span>{i.productName}{i.variantName ? ` (${i.variantName})` : ""} <span className="num text-ink-muted">×{i.quantity}</span></span><Money value={i.lineTotal} /></li>
            ))}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-line pt-3">
            {order.discountTotal ? <div className="flex justify-between text-success"><dt>الخصم</dt><dd>−<Money value={order.discountTotal} /></dd></div> : null}
            {order.shippingTotal ? <div className="flex justify-between"><dt>الشحن</dt><dd><Money value={order.shippingTotal} /></dd></div> : null}
            {order.codFee ? <div className="flex justify-between"><dt>رسوم الدفع عند الاستلام</dt><dd><Money value={order.codFee} /></dd></div> : null}
            <div className="flex justify-between font-semibold"><dt>الإجمالي</dt><dd><Money value={order.total} /></dd></div>
          </dl>
        </div>
      </section>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink href="/shop" variant="secondary">متابعة التسوق</ButtonLink>
        {order.customerId ? <ButtonLink href={`/account/orders/${order.number}`}>تفاصيل الطلب</ButtonLink> : <Link href="/track" className="self-center text-sm underline">تتبع الطلب لاحقاً</Link>}
      </div>
    </div>
  );
}
