import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { loyaltyLiability } from "@/modules/reports/service";
import { getSetting } from "@/server/settings";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardHeader, DateText, Money, Stat, Table, Td, Th } from "@/ui/primitives";
import { LOYALTY_TX_LABELS } from "@/i18n/labels";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("برنامج الولاء") };
}

export default async function LoyaltyPage() {
  const t = await getT();
  const actor = await requireStaffPage("loyalty.read");
  const [liability, settings, recent] = await Promise.all([
    loyaltyLiability(actor),
    getSetting("loyalty"),
    db.loyaltyTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { account: { include: { customer: { select: { id: true, firstName: true, lastName: true } } } } } }),
  ]);
  return (
    <>
      <PageHeader title={t("برنامج الولاء")} description={<>{settings.enabled ? t("مفعّل") : t("متوقف")} · {settings.pointsPerEgp} {t("نقطة لكل جنيه · قيمة النقطة")}{" "}<Money value={settings.pointValuePiasters} /> · <Link href="/admin/settings#loyalty" className="text-sun-700 hover:underline">{t("تعديل القواعد")}</Link></>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label={t("حسابات الولاء")} value={t.number(liability.accounts)} />
        <Stat label={t("النقاط القائمة")} value={t.number(liability.outstandingPoints)} hint={<>{t("التزام قدره")}{" "}<Money value={liability.outstandingPoints * settings.pointValuePiasters} /></>} />
        <Stat label={t("إجمالي النقاط المكتسبة")} value={t.number(liability.lifetimeEarned)} />
      </div>
      <Card>
        <CardHeader title={t("آخر الحركات")} description={t("سجل غير قابل للتعديل؛ التصحيح يتم بحركة تسوية من ملف العميل.")} />
        <Table>
          <thead><tr><Th>{t("العميل")}</Th><Th>{t("النوع")}</Th><Th>{t("النقاط")}</Th><Th>{t("الرصيد بعدها")}</Th><Th>{t("السبب")}</Th><Th>{t("التاريخ")}</Th></tr></thead>
          <tbody>
            {recent.map((tx) => (
              <tr key={tx.id}>
                <Td><Link className="text-sun-700 hover:underline" href={`/admin/customers/${tx.account.customer.id}`}>{tx.account.customer.firstName} {tx.account.customer.lastName ?? ""}</Link></Td>
                <Td>{t(LOYALTY_TX_LABELS[tx.type])}</Td>
                <Td className="num" dir="ltr">{tx.points > 0 ? `+${tx.points}` : tx.points}</Td>
                <Td className="num">{t.number(tx.balanceAfter)}</Td>
                <Td className="text-xs">{tx.reason ? t.message(tx.reason) : "—"}</Td>
                <Td><DateText value={tx.createdAt} withTime /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
