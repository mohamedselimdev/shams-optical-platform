import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { loyaltyLiability } from "@/modules/reports/service";
import { getSetting } from "@/server/settings";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardHeader, DateText, Money, Stat, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { LOYALTY_TX_LABELS } from "@/i18n/labels";

export const metadata = { title: "برنامج الولاء" };

export default async function LoyaltyPage() {
  const actor = await requireStaffPage("loyalty.read");
  const [liability, settings, recent] = await Promise.all([
    loyaltyLiability(actor),
    getSetting("loyalty"),
    db.loyaltyTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { account: { include: { customer: { select: { id: true, firstName: true, lastName: true } } } } } }),
  ]);
  return (
    <>
      <PageHeader title="برنامج الولاء" description={<>{settings.enabled ? "مفعّل" : "متوقف"} · {settings.pointsPerEgp} نقطة لكل جنيه · قيمة النقطة <Money value={settings.pointValuePiasters} /> · <Link href="/admin/settings#loyalty" className="text-sun-700 hover:underline">تعديل القواعد</Link></>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="حسابات الولاء" value={numberFmt.format(liability.accounts)} />
        <Stat label="النقاط القائمة" value={numberFmt.format(liability.outstandingPoints)} hint={<>التزام قدره <Money value={liability.outstandingPoints * settings.pointValuePiasters} /></>} />
        <Stat label="إجمالي النقاط المكتسبة" value={numberFmt.format(liability.lifetimeEarned)} />
      </div>
      <Card>
        <CardHeader title="آخر الحركات" description="سجل غير قابل للتعديل؛ التصحيح يتم بحركة تسوية من ملف العميل." />
        <Table>
          <thead><tr><Th>العميل</Th><Th>النوع</Th><Th>النقاط</Th><Th>الرصيد بعدها</Th><Th>السبب</Th><Th>التاريخ</Th></tr></thead>
          <tbody>
            {recent.map((tx) => (
              <tr key={tx.id}>
                <Td><Link className="text-sun-700 hover:underline" href={`/admin/customers/${tx.account.customer.id}`}>{tx.account.customer.firstName} {tx.account.customer.lastName ?? ""}</Link></Td>
                <Td>{LOYALTY_TX_LABELS[tx.type]}</Td>
                <Td className="num" dir="ltr">{tx.points > 0 ? `+${tx.points}` : tx.points}</Td>
                <Td className="num">{numberFmt.format(tx.balanceAfter)}</Td>
                <Td className="text-xs">{tx.reason ?? "—"}</Td>
                <Td><DateText value={tx.createdAt} withTime /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
