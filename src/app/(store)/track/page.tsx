import { trackOrder } from "@/modules/orders/service";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { zEgyptPhone } from "@/lib/validation";
import { FULFILLMENT_LABELS, ORDER_STATUS_LABELS } from "@/i18n/labels";
import { DateText } from "@/ui/primitives";

export const metadata = { title: "تتبع طلبك", robots: { index: false } };

/** Guest order tracking: both the order number and the phone used at checkout must match. */
export default async function Track({ searchParams }: { searchParams: Promise<{ number?: string; phone?: string }> }) {
  const sp = await searchParams;
  let result: Awaited<ReturnType<typeof trackOrder>> = null;
  let error: string | null = null;
  if (sp.number && sp.phone) {
    const phone = zEgyptPhone.safeParse(sp.phone);
    const limited = !(await rateLimit(`track:${await clientIp()}`, 20, 600)).ok;
    if (limited) error = "محاولات كثيرة، حاول لاحقاً.";
    else if (!phone.success) error = "رقم الموبايل غير صالح.";
    else {
      result = await trackOrder(sp.number.slice(0, 40), phone.data);
      if (!result) error = "لم نجد طلباً بهذه البيانات. تأكد من رقم الطلب ورقم الموبايل المستخدم عند الطلب.";
    }
  }
  return (
    <div className="container-page max-w-2xl py-12">
      <h1 className="font-display text-3xl font-semibold">تتبع طلبك</h1>
      <form method="get" className="mt-6 grid gap-3 rounded-lg border border-line bg-surface p-5 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm"><span className="mb-1 block font-medium">رقم الطلب</span><input name="number" defaultValue={sp.number} required placeholder="SH-2026-000123" dir="ltr" className="h-10 w-full rounded-md border border-line-strong bg-surface px-3" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">رقم الموبايل</span><input name="phone" defaultValue={sp.phone} required inputMode="tel" dir="ltr" className="h-10 w-full rounded-md border border-line-strong bg-surface px-3" /></label>
        <button type="submit" className="h-10 self-end rounded-md bg-ink px-5 text-sm font-medium text-surface">تتبع</button>
      </form>
      {error ? <p role="alert" className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p> : null}
      {result ? (
        <section className="mt-6 rounded-lg border border-line bg-surface p-5 text-sm" aria-live="polite">
          <p className="font-semibold"><span className="num" dir="ltr">{result.number}</span> — {ORDER_STATUS_LABELS[result.status]}</p>
          <p className="text-ink-muted">{FULFILLMENT_LABELS[result.fulfillmentType]}{result.pickupBranch ? ` · ${result.pickupBranch.name}` : ""}</p>
          {result.shipments.map((s, i) => <p key={i} className="mt-1">{s.carrier}{s.trackingNumber ? <span className="num ms-1" dir="ltr">#{s.trackingNumber}</span> : null}</p>)}
          <ol className="mt-4 space-y-3 border-s border-line ps-4">
            {result.events.map((e, i) => (
              <li key={i} className="relative">
                <span className="absolute -start-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-sun-400" aria-hidden />
                <p className="font-medium">{e.toStatus ? ORDER_STATUS_LABELS[e.toStatus] : e.message}</p>
                <p className="text-xs text-ink-faint"><DateText value={e.createdAt} withTime /></p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
