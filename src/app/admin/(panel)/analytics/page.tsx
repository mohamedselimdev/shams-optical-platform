import { requireStaffPage } from "@/server/auth/session";
import { abandonedCartStats, branchSelections, deviceBreakdown, funnel, topSearches, topViewedProducts, trafficOverview, trafficSources } from "@/modules/analytics/service";
import { getSetting } from "@/server/settings";
import { PageHeader } from "@/components/admin/page-header";
import { RangeFilter } from "@/components/admin/range-filter";
import { parseRange } from "@/components/admin/range";
import { Card, CardBody, CardHeader, Money, Stat, Table, Td, Th, numberFmt, percentFmt } from "@/ui/primitives";

export const metadata = { title: "التحليلات" };

const STEP_LABELS: Record<string, string> = { page_view: "زيارة", product_view: "عرض منتج", add_to_cart: "إضافة للسلة", checkout_started: "بدء الدفع", payment_started: "صفحة الدفع", purchase: "شراء" };
const DEVICE: Record<string, string> = { mobile: "جوال", desktop: "كمبيوتر", tablet: "تابلت", unknown: "غير معروف" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  await requireStaffPage("analytics.read");
  const range = parseRange(await searchParams);
  const [overview, steps, sources, products, devices, searches, branches, carts, settings] = await Promise.all([
    trafficOverview(range), funnel(range), trafficSources(range), topViewedProducts(range), deviceBreakdown(range), topSearches(range), branchSelections(range), abandonedCartStats(range), getSetting("analytics"),
  ]);
  const top = Math.max(steps[0]?.sessions ?? 0, 1);
  return (
    <>
      <PageHeader title="التحليلات" description={`تحليلات داخلية بدون أطراف ثالثة${settings.requireConsent ? "، تُسجَّل فقط بعد موافقة الزائر" : ""}. عناوين IP تُخزَّن مُجزّأة.`} actions={<RangeFilter fromStr={range.fromStr} toStr={range.toStr} branchId={null} branches={[]} />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="الجلسات" value={numberFmt.format(overview.sessions)} />
        <Stat label="الزوار" value={numberFmt.format(overview.visitors)} />
        <Stat label="مشاهدات الصفحات" value={numberFmt.format(overview.pageViews)} />
        <Stat label="معدل التحويل" value={percentFmt.format(overview.conversionRate)} hint={`${numberFmt.format(overview.purchasingSessions)} جلسة شراء`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="قمع التحويل" />
          <CardBody className="space-y-3">
            {steps.map((s) => (
              <div key={s.step}>
                <div className="flex justify-between text-sm"><span>{STEP_LABELS[s.step]}</span><span className="num">{numberFmt.format(s.sessions)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-sun-400" style={{ width: `${(s.sessions / top) * 100}%` }} /></div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="مصادر الزيارات" />
          <Table>
            <thead><tr><Th>المصدر</Th><Th>الوسيط</Th><Th>الجلسات</Th><Th>المشتريات</Th><Th>الإيراد</Th></tr></thead>
            <tbody>{sources.map((s, i) => <tr key={i}><Td>{s.source}</Td><Td>{s.medium}</Td><Td className="num">{numberFmt.format(s.sessions)}</Td><Td className="num">{numberFmt.format(s.purchases)}</Td><Td><Money value={s.revenue} /></Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="أكثر المنتجات مشاهدة" />
          <Table>
            <thead><tr><Th>المنتج</Th><Th>المشاهدات</Th><Th>أضيف للسلة</Th></tr></thead>
            <tbody>{products.map((p) => <tr key={p.productId}><Td>{p.name}</Td><Td className="num">{numberFmt.format(p.views)}</Td><Td className="num">{numberFmt.format(p.addToCart)}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="عمليات البحث" />
          <Table>
            <thead><tr><Th>الكلمة</Th><Th>العدد</Th></tr></thead>
            <tbody>{searches.map((s) => <tr key={s.term}><Td>{s.term}</Td><Td className="num">{numberFmt.format(s.count)}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="الأجهزة واختيار الفروع" />
          <CardBody className="grid gap-6 sm:grid-cols-2 text-sm">
            <ul className="space-y-1">{devices.map((d) => <li key={d.device} className="flex justify-between"><span>{DEVICE[d.device] ?? d.device}</span><span className="num">{numberFmt.format(d.sessions)}</span></li>)}</ul>
            <ul className="space-y-1">{branches.map((b) => <li key={b.branch} className="flex justify-between"><span>{b.branch}</span><span className="num">{numberFmt.format(b.count)}</span></li>)}</ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="السلات المتروكة" />
          <CardBody className="grid grid-cols-3 gap-4">
            <Stat label="متروكة" value={numberFmt.format(carts.abandoned)} />
            <Stat label="يمكن التواصل" value={numberFmt.format(carts.contactable)} />
            <Stat label="استُعيدت" value={numberFmt.format(carts.recovered)} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
