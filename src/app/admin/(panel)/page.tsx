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
import { Badge, Card, CardBody, CardHeader, DateText, Money, Stat, Table, Td, Th, numberFmt, percentFmt } from "@/ui/primitives";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS } from "@/i18n/labels";
import { orderTone, paymentTone } from "@/i18n/tones";

export const metadata = { title: "نظرة عامة" };

export default async function Overview({ searchParams }: { searchParams: Promise<RangeParams> }) {
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
        title="نظرة عامة"
        description="مؤشرات الأداء للفترة المحددة. صافي المبيعات = إجمالي الطلبات المؤكدة ناقص المبالغ المستردة."
        actions={<RangeFilter fromStr={range.fromStr} toStr={range.toStr} branchId={range.branchId} branches={branches} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="صافي المبيعات" value={<Money value={kpi.netSales} />} hint={`${numberFmt.format(kpi.orders)} طلب`} />
        <Stat label="متوسط قيمة الطلب" value={<Money value={kpi.aov} />} />
        {can(actor, "reports.financial") ? (
          <Stat label="مجمل الربح" value={<Money value={kpi.grossMargin} />} hint={`هامش ${percentFmt.format(kpi.marginRate)} (بدون الضريبة)`} />
        ) : (
          <Stat label="الخصومات" value={<Money value={kpi.discounts} />} />
        )}
        <Stat label="المستردات" value={<Money value={kpi.refunds} />} hint={`${numberFmt.format(kpi.returns)} طلب إرجاع`} />
        <Stat label="العملاء المشترون" value={numberFmt.format(kpi.buyingCustomers)} hint={`${numberFmt.format(kpi.newCustomers)} عميل جديد`} />
        <Stat label="سلات بها منتجات" value={numberFmt.format(kpi.carts)} hint={`${numberFmt.format(kpi.checkouts)} بدأوا الدفع`} />
        <Stat label="معدل التحويل (سلة ← طلب)" value={percentFmt.format(conversion)} />
        <Stat label="بانتظار الإجراء" value={<span className="text-lg">{pendingRx !== null ? `${numberFmt.format(pendingRx)} وصفة` : ""}{pendingRx !== null && openReturns !== null ? " · " : ""}{openReturns !== null ? `${numberFmt.format(openReturns)} مرتجع` : ""}</span>} />
      </div>

      {showReports ? (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="اتجاه المبيعات اليومي" />
            <CardBody><SalesTrendChart data={trend} /></CardBody>
          </Card>
          <Card>
            <CardHeader title="المبيعات حسب الفرع" />
            <CardBody><BarList data={byBranch} labelKey="branch" valueKey="net" /></CardBody>
          </Card>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {recent ? (
          <Card className="xl:col-span-2">
            <CardHeader title="أحدث الطلبات" actions={<Link href="/admin/orders" className="text-sm text-sun-700 hover:underline">كل الطلبات</Link>} />
            <Table>
              <thead><tr><Th>الطلب</Th><Th>العميل</Th><Th>الحالة</Th><Th>الدفع</Th><Th>الإجمالي</Th><Th>التاريخ</Th></tr></thead>
              <tbody>
                {recent.items.slice(0, 8).map((o) => (
                  <tr key={o.id}>
                    <Td><Link href={`/admin/orders/${o.id}`} className="num font-medium text-sun-700 hover:underline">{o.number}</Link></Td>
                    <Td>{o.contactName}</Td>
                    <Td><Badge tone={orderTone[o.status]}>{ORDER_STATUS_LABELS[o.status]}</Badge></Td>
                    <Td><Badge tone={paymentTone[o.paymentStatus]}>{PAYMENT_STATUS_LABELS[o.paymentStatus]}</Badge></Td>
                    <Td><Money value={o.total} /></Td>
                    <Td><DateText value={o.placedAt} withTime /></Td>
                  </tr>
                ))}
                {recent.items.length === 0 ? <tr><Td colSpan={6} className="py-8 text-center text-ink-muted">لا توجد طلبات بعد</Td></tr> : null}
              </tbody>
            </Table>
          </Card>
        ) : null}
        {showStock ? (
          <Card>
            <CardHeader title="مخزون منخفض" actions={<Link href="/admin/inventory?low=1" className="text-sm text-sun-700 hover:underline">المخزون</Link>} />
            <ul className="divide-y divide-line">
              {low.map((r) => (
                <li key={`${r.sku}-${r.branch}`} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{r.product}</p>
                    <p className="num text-xs text-ink-muted">{r.sku} · {r.branch}</p>
                  </div>
                  <Badge tone={r.onHand - r.reserved <= 0 ? "danger" : "warning"}>متاح {numberFmt.format(r.onHand - r.reserved)}</Badge>
                </li>
              ))}
              {low.length === 0 ? <li className="px-5 py-8 text-center text-sm text-ink-muted">لا توجد أصناف منخفضة</li> : null}
            </ul>
          </Card>
        ) : null}
      </div>
    </>
  );
}
