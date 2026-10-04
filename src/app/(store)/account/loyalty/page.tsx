import { requireCustomerPage } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { loyaltyHistory } from "@/modules/loyalty/service";
import { LOYALTY_TX_LABELS } from "@/i18n/labels";
import { DateText, Money, Table, Td, Th } from "@/ui/primitives";

export const metadata = { title: "نقاط الولاء" };

export default async function Loyalty() {
  const actor = await requireCustomerPage("/account/loyalty");
  const [h, s] = await Promise.all([loyaltyHistory(actor.customerId), getSetting("loyalty")]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">نقاط الولاء</h1>
      <div className="rounded-xl bg-ink p-6 text-surface">
        <p className="text-sm text-surface/70">رصيدك الحالي</p>
        <p className="num mt-1 font-display text-4xl font-bold text-sun-300">{h.balance} <span className="text-lg">نقطة</span></p>
        <p className="mt-2 text-sm text-surface/80">تساوي <Money value={h.balance * s.pointValuePiasters} /> · تكسب {s.pointsPerEgp} نقطة لكل جنيه بعد استلام الطلب، ويمكن الاستبدال من {s.minRedeemPoints} نقطة.</p>
      </div>
      {h.transactions.length ? (
        <div className="rounded-lg border border-line bg-surface">
          <Table>
            <thead><tr><Th>التاريخ</Th><Th>العملية</Th><Th>الطلب</Th><Th>النقاط</Th></tr></thead>
            <tbody>
              {h.transactions.map((t) => (
                <tr key={t.id}>
                  <Td><DateText value={t.createdAt} /></Td>
                  <Td>{LOYALTY_TX_LABELS[t.type]}</Td>
                  <Td dir="ltr" className="num text-start">{t.order?.number ?? "—"}</Td>
                  <Td className={`num ${t.points > 0 ? "text-success" : "text-danger"}`} dir="ltr">{t.points > 0 ? `+${t.points}` : t.points}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
