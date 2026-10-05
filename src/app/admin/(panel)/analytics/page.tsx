import { requireStaffPage } from "@/server/auth/session";
import { abandonedCartStats, branchSelections, deviceBreakdown, funnel, topSearches, topViewedProducts, trafficOverview, trafficSources } from "@/modules/analytics/service";
import { getSetting } from "@/server/settings";
import { PageHeader } from "@/components/admin/page-header";
import { RangeFilter } from "@/components/admin/range-filter";
import { parseRange } from "@/components/admin/range";
import { Card, CardBody, CardHeader, Money, Stat, Table, Td, Th } from "@/ui/primitives";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("التحليلات") };
}

const STEP_LABELS: Record<string, string> = { page_view: "زيارة", product_view: "عرض منتج", add_to_cart: "إضافة للسلة", checkout_started: "بدء الدفع", payment_started: "صفحة الدفع", purchase: "شراء" };
const DEVICE: Record<string, string> = { mobile: "جوال", desktop: "كمبيوتر", tablet: "تابلت", unknown: "غير معروف" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const t = await getT();
  await requireStaffPage("analytics.read");
  const range = parseRange(await searchParams);
  const [overview, steps, sources, products, devices, searches, branches, carts, settings] = await Promise.all([
    trafficOverview(range), funnel(range), trafficSources(range), topViewedProducts(range), deviceBreakdown(range), topSearches(range), branchSelections(range), abandonedCartStats(range), getSetting("analytics"),
  ]);
  const top = Math.max(steps[0]?.sessions ?? 0, 1);
  return (
    <>
      <PageHeader title={t("التحليلات")} description={t("تحليلات داخلية بدون أطراف ثالثة{0}. عناوين IP تُخزَّن مُجزّأة.", [settings.requireConsent ? t("، تُسجَّل فقط بعد موافقة الزائر") : ""])} actions={<RangeFilter fromStr={range.fromStr} toStr={range.toStr} branchId={null} branches={[]} />} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t("الجلسات")} value={t.number(overview.sessions)} />
        <Stat label={t("الزوار")} value={t.number(overview.visitors)} />
        <Stat label={t("مشاهدات الصفحات")} value={t.number(overview.pageViews)} />
        <Stat label={t("معدل التحويل")} value={t.percent(overview.conversionRate)} hint={t("{0} جلسة شراء", [t.number(overview.purchasingSessions)])} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title={t("قمع التحويل")} />
          <CardBody className="space-y-3">
            {steps.map((s) => (
              <div key={s.step}>
                <div className="flex justify-between text-sm"><span>{t(STEP_LABELS[s.step])}</span><span className="num">{t.number(s.sessions)}</span></div>
                <div className="mt-1 h-2 rounded-full bg-surface-2"><div className="h-2 rounded-full bg-sun-400" style={{ width: `${(s.sessions / top) * 100}%` }} /></div>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("مصادر الزيارات")} />
          <Table>
            <thead><tr><Th>{t("المصدر")}</Th><Th>{t("الوسيط")}</Th><Th>{t("الجلسات")}</Th><Th>{t("المشتريات")}</Th><Th>{t("الإيراد")}</Th></tr></thead>
            <tbody>{sources.map((s, i) => <tr key={i}><Td>{s.source}</Td><Td>{s.medium}</Td><Td className="num">{t.number(s.sessions)}</Td><Td className="num">{t.number(s.purchases)}</Td><Td><Money value={s.revenue} /></Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={t("أكثر المنتجات مشاهدة")} />
          <Table>
            <thead><tr><Th>{t("المنتج")}</Th><Th>{t("المشاهدات")}</Th><Th>{t("أضيف للسلة")}</Th></tr></thead>
            <tbody>{products.map((p) => <tr key={p.productId}><Td>{p.name}</Td><Td className="num">{t.number(p.views)}</Td><Td className="num">{t.number(p.addToCart)}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={t("عمليات البحث")} />
          <Table>
            <thead><tr><Th>{t("الكلمة")}</Th><Th>{t("العدد")}</Th></tr></thead>
            <tbody>{searches.map((s) => <tr key={s.term}><Td>{s.term}</Td><Td className="num">{t.number(s.count)}</Td></tr>)}</tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={t("الأجهزة واختيار الفروع")} />
          <CardBody className="grid gap-6 sm:grid-cols-2 text-sm">
            <ul className="space-y-1">{devices.map((d) => <li key={d.device} className="flex justify-between"><span>{t(DEVICE[d.device] ?? d.device)}</span><span className="num">{t.number(d.sessions)}</span></li>)}</ul>
            <ul className="space-y-1">{branches.map((b) => <li key={b.branch} className="flex justify-between"><span>{b.branch}</span><span className="num">{t.number(b.count)}</span></li>)}</ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={t("السلات المتروكة")} />
          <CardBody className="grid grid-cols-3 gap-4">
            <Stat label={t("متروكة")} value={t.number(carts.abandoned)} />
            <Stat label={t("يمكن التواصل")} value={t.number(carts.contactable)} />
            <Stat label={t("استُعيدت")} value={t.number(carts.recovered)} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
