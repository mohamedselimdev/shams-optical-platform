import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { dashboardKpis, lowStock, salesByBranch, salesByDay } from "@/modules/reports/service";
import { listOrders } from "@/modules/orders/service";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { RangeFilter } from "@/components/admin/range-filter";
import { actorBranches, parseRange, type RangeParams } from "@/components/admin/range";
import { BarList, SalesTrendChart } from "@/components/admin/charts";
import { Badge, Card, CardBody, CardHeader, DateText, Money, Stat, Table, Td, Th } from "@/ui/primitives";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/i18n/labels";
import { orderTone, paymentTone } from "@/i18n/tones";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("نظرة عامة") };
}

export default async function Overview({ searchParams }: { searchParams: Promise<RangeParams> }) {
  const t = await getT();
  const actor = await requireStaffPage("dashboard.view");
  const range = parseRange(await searchParams);
  const showReports = can(actor, "reports.read");
  const showStock = can(actor, "inventory.read");
  const showOrders = can(actor, "orders.read");
  const [kpi, branches, trend, byBranch, low, recent, pendingRx, openReturns] = await Promise.all([
    dashboardKpis(actor, range),
    actorBranches(actor),
    showReports ? salesByDay(actor, range) : Promise.resolve([]),
    showReports ? salesByBranch(actor, range) : Promise.resolve([]),
    showStock ? lowStock(actor, range.branchId, 8) : Promise.resolve([]),
    showOrders ? listOrders(actor, { branchId: range.branchId ?? undefined }) : Promise.resolve(null),
    can(actor, "prescriptions.read") ? db.prescription.count({ where: { status: "PENDING_REVIEW", isArchived: false } }) : Promise.resolve(null),
    can(actor, "returns.read") ? db.returnRequest.count({ where: { status: { in: ["REQUESTED", "APPROVED", "RECEIVED", "INSPECTED"] } } }) : Promise.resolve(null),
  ]);
  const conversion = kpi.carts ? kpi.orders / kpi.carts : 0;

  return (
    <>
      <PageHeader
        title={t("نظرة عامة")}
        description={t("مؤشرات الأداء للفترة المحددة. صافي المبيعات = إجمالي الطلبات المؤكدة ناقص المبالغ المستردة.")}
        actions={<RangeFilter fromStr={range.fromStr} toStr={range.toStr} branchId={range.branchId} branches={branches} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("صافي المبيعات")} value={<Money value={kpi.netSales} />} hint={t("{0} طلب", [t.number(kpi.orders)])} />
        <Stat label={t("متوسط قيمة الطلب")} value={<Money value={kpi.aov} />} />
        {can(actor, "reports.financial") ? (
          <Stat label={t("مجمل الربح")} value={<Money value={kpi.grossMargin} />} hint={t("هامش {0} (بدون الضريبة)", [t.percent(kpi.marginRate)])} />
        ) : (
          <Stat label={t("الخصومات")} value={<Money value={kpi.discounts} />} />
        )}
        <Stat label={t("المستردات")} value={<Money value={kpi.refunds} />} hint={t("{0} طلب إرجاع", [t.number(kpi.returns)])} />
        <Stat label={t("العملاء المشترون")} value={t.number(kpi.buyingCustomers)} hint={t("{0} عميل جديد", [t.number(kpi.newCustomers)])} />
        <Stat label={t("سلات بها منتجات")} value={t.number(kpi.carts)} hint={t("{0} بدأوا الدفع", [t.number(kpi.checkouts)])} />
        <Stat label={t("معدل التحويل (سلة ← طلب)")} value={t.percent(conversion)} />
        <Stat label={t("بانتظار الإجراء")} value={<span className="text-lg">{pendingRx !== null ? t("{0} وصفة", [t.number(pendingRx)]) : ""}{pendingRx !== null && openReturns !== null ? " · " : ""}{openReturns !== null ? t("{0} مرتجع", [t.number(openReturns)]) : ""}</span>} />
      </div>

      {showReports ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card className="min-w-0 xl:col-span-2">
            <CardHeader title={t("اتجاه المبيعات اليومي")} />
            <CardBody><SalesTrendChart data={trend} /></CardBody>
          </Card>
          <Card>
            <CardHeader title={t("المبيعات حسب الفرع")} />
            <CardBody><BarList data={byBranch} labelKey="branch" valueKey="net" /></CardBody>
          </Card>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {recent ? (
          <Card className="min-w-0 xl:col-span-2">
            <CardHeader title={t("أحدث الطلبات")} actions={<Link href="/admin/orders" className="text-sm text-sun-700 hover:underline">{t("كل الطلبات")}</Link>} />
            <Table>
              <thead><tr><Th>{t("الطلب")}</Th><Th>{t("العميل")}</Th><Th>{t("الحالة")}</Th><Th>{t("الدفع")}</Th><Th>{t("الإجمالي")}</Th><Th>{t("التاريخ")}</Th></tr></thead>
              <tbody>
                {recent.items.slice(0, 8).map((o) => (
                  <tr key={o.id}>
                    <Td><Link href={`/admin/orders/${o.id}`} className="num font-medium text-sun-700 hover:underline">{o.number}</Link></Td>
                    <Td>{o.contactName}</Td>
                    <Td><Badge tone={orderTone[o.status]}>{t(ORDER_STATUS_LABELS[o.status])}</Badge></Td>
                    <Td><Badge tone={paymentTone[o.paymentStatus]}>{t(PAYMENT_STATUS_LABELS[o.paymentStatus])}</Badge></Td>
                    <Td><Money value={o.total} /></Td>
                    <Td><DateText value={o.placedAt} withTime /></Td>
                  </tr>
                ))}
                {recent.items.length === 0 ? <tr><Td colSpan={6} className="py-8 text-center text-ink-muted">{t("لا توجد طلبات بعد")}</Td></tr> : null}
              </tbody>
            </Table>
          </Card>
        ) : null}
        {showStock ? (
          <Card>
            <CardHeader title={t("مخزون منخفض")} actions={<Link href="/admin/inventory?low=1" className="text-sm text-sun-700 hover:underline">{t("المخزون")}</Link>} />
            <ul className="divide-y divide-line">
              {low.map((r) => (
                <li key={`${r.sku}-${r.branch}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.product}</p>
                    <p className="num text-xs text-ink-muted">{r.sku} · {r.branch}</p>
                  </div>
                  <Badge tone={r.onHand - r.reserved <= 0 ? "danger" : "warning"}>{t("متاح {0}", [t.number(r.onHand - r.reserved)])}</Badge>
                </li>
              ))}
              {low.length === 0 ? <li className="px-5 py-8 text-center text-sm text-ink-muted">{t("لا توجد أصناف منخفضة")}</li> : null}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
