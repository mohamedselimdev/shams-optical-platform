import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { listOrders } from "@/modules/orders/service";
import { PageHeader } from "@/components/admin/page-header";
import { actorBranches } from "@/components/admin/range";
import { Badge, Card, DateText, EmptyState, Money, Pagination, Table, Td, Th } from "@/ui/primitives";
import { buttonClass } from "@/ui/button";
import { CHANNEL_LABELS, FULFILLMENT_LABELS, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from "@/i18n/labels";
import { orderTone, paymentTone } from "@/i18n/tones";
import { OrderStatus } from "@/generated/prisma/enums";
import { can } from "@/server/rbac/actor";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("الطلبات") };
}

type SP = { q?: string; status?: string; branch?: string; channel?: string; page?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const t = await getT();
  const actor = await requireStaffPage("orders.read");
  const sp = await searchParams;
  const status = sp.status && sp.status in OrderStatus ? (sp.status as OrderStatus) : undefined;
  const branches = await actorBranches(actor);
  const branchId = branches.some((b) => b.id === sp.branch) ? sp.branch : undefined;
  const channel = sp.channel && sp.channel in CHANNEL_LABELS ? sp.channel : undefined;
  const { items, total, page, pageSize } = await listOrders(actor, { q: sp.q?.trim().slice(0, 80) || undefined, status, branchId, channel, page: Number(sp.page) || 1 });
  const input = "h-9 rounded-md border border-line bg-surface px-2 text-sm";
  return (
    <>
      <PageHeader
        title={t("الطلبات")}
        description={t("{0} طلب", [t.number(total)])}
        actions={can(actor, "reports.export") ? <a href={`/admin/export/orders?${new URLSearchParams(Object.entries({ q: sp.q, status, branch: branchId, channel }).filter(([, v]) => v) as [string, string][])}`} className={buttonClass("secondary", "sm")}>{t("تصدير CSV")}</a> : null}
      />
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-2 border-b border-line p-4">
          <input name="q" defaultValue={sp.q} placeholder={t("رقم الطلب، الاسم، الهاتف…")} className={`${input} w-64`} aria-label={t("بحث")} />
          <select name="status" defaultValue={status ?? ""} className={input} aria-label={t("الحالة")}>
            <option value="">{t("كل الحالات")}</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          {branches.length > 1 ? (
            <select name="branch" defaultValue={branchId ?? ""} className={input} aria-label={t("الفرع")}>
              <option value="">{t("كل الفروع")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          ) : null}
          <select name="channel" defaultValue={channel ?? ""} className={input} aria-label={t("القناة")}>
            <option value="">{t("كل القنوات")}</option>
            {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <button className={buttonClass("secondary", "sm")}>{t("بحث")}</button>
        </form>
        {items.length ? (
          <Table>
            <thead>
              <tr><Th>{t("الطلب")}</Th><Th>{t("العميل")}</Th><Th>{t("الحالة")}</Th><Th>{t("الدفع")}</Th><Th>{t("الاستلام")}</Th><Th>{t("الفرع")}</Th><Th>{t("الإجمالي")}</Th><Th>{t("التاريخ")}</Th></tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id} className="hover:bg-surface-2/60">
                  <Td>
                    <Link href={`/admin/orders/${o.id}`} className="num font-medium text-sun-700 hover:underline">{o.number}</Link>
                    <div className="mt-0.5 flex gap-1 text-[11px] text-ink-muted">
                      {t(CHANNEL_LABELS[o.channel])} · {t.number(o._count.items)} {t("صنف")}
                      {o.requiresPrescription ? <Badge tone="info" className="!py-0">{t("وصفة")}</Badge> : null}
                    </div>
                  </Td>
                  <Td>
                    {o.contactName}
                    <div className="num text-xs text-ink-muted" dir="ltr">{o.contactPhone}</div>
                  </Td>
                  <Td><Badge tone={orderTone[o.status]}>{t(ORDER_STATUS_LABELS[o.status])}</Badge></Td>
                  <Td>
                    <Badge tone={paymentTone[o.paymentStatus]}>{t(PAYMENT_STATUS_LABELS[o.paymentStatus])}</Badge>
                    <div className="mt-0.5 text-[11px] text-ink-muted">{t(PAYMENT_METHOD_LABELS[o.paymentMethod])}</div>
                  </Td>
                  <Td>{t(FULFILLMENT_LABELS[o.fulfillmentType])}</Td>
                  <Td>{o.fulfillmentBranch.name}</Td>
                  <Td><Money value={o.total} /></Td>
                  <Td><DateText value={o.placedAt} withTime /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title={t("لا توجد طلبات مطابقة")} description={t("جرّب تغيير معايير البحث.")} />
        )}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/orders" params={{ q: sp.q, status, branch: branchId, channel }} />
      </Card>
    </>
  );
}
