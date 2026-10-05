import { requireCustomerPage } from "@/server/auth/session";
import { listMyReturns } from "@/modules/returns/service";
import { RETURN_RESOLUTION_LABELS, RETURN_STATUS_LABELS } from "@/i18n/labels";
import { returnTone } from "@/i18n/tones";
import { Badge, DateText, EmptyState, Money } from "@/ui/primitives";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("المرتجعات") };
}

export default async function MyReturns({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const t = await getT();
  const actor = await requireCustomerPage("/account/returns");
  const [list, sp] = await Promise.all([listMyReturns(actor.customerId), searchParams]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">{t("المرتجعات")}</h1>
      {sp.created ? <p role="status" className="rounded-md bg-success-soft p-3 text-sm text-success">{t("تم إرسال طلب الإرجاع وسنتواصل معك قريباً.")}</p> : null}
      {list.length ? (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id} className="rounded-lg border border-line bg-surface p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium"><span className="num" dir="ltr">{r.number}</span> {t("· طلب")}{" "}<span className="num" dir="ltr">{r.order.number}</span></p>
                <Badge tone={returnTone[r.status]}>{t(RETURN_STATUS_LABELS[r.status])}</Badge>
              </div>
              <p className="text-xs text-ink-muted"><DateText value={r.createdAt} /> · {t(RETURN_RESOLUTION_LABELS[r.resolution])}</p>
              <ul className="mt-2 text-ink-soft">{r.items.map((i) => <li key={i.id}>{i.orderItem.productName}{i.orderItem.variantName ? ` (${i.orderItem.variantName})` : ""} × <span className="num">{i.quantity}</span></li>)}</ul>
              {r.refundAmount ? <p className="mt-2">{t("المبلغ المسترد:")}{" "}<Money value={r.refundAmount} /></p> : null}
            </li>
          ))}
        </ul>
      ) : <EmptyState title={t("لا توجد طلبات إرجاع")} description={t("يمكنك طلب الإرجاع من صفحة الطلب بعد الاستلام.")} />}
    </div>
  );
}
