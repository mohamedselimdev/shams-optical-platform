import { requireCustomerPage } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { loyaltyHistory } from "@/modules/loyalty/service";
import { LOYALTY_TX_LABELS } from "@/i18n/labels";
import { DateText, Money, Table, Td, Th } from "@/ui/primitives";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("نقاط الولاء") };
}

export default async function Loyalty() {
  const t = await getT();
  const actor = await requireCustomerPage("/account/loyalty");
  const [h, s] = await Promise.all([loyaltyHistory(actor.customerId), getSetting("loyalty")]);
  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">{t("نقاط الولاء")}</h1>
      <div className="rounded-xl bg-night p-6 text-on-night">
        <p className="text-sm text-surface/70">{t("رصيدك الحالي")}</p>
        <p className="num mt-1 font-display text-4xl font-bold text-sun-300">{h.balance} <span className="text-lg">{t("نقطة")}</span></p>
        <p className="mt-2 text-sm text-surface/80">{t("تساوي")}{" "}<Money value={h.balance * s.pointValuePiasters} /> {t("· تكسب")}{" "}{s.pointsPerEgp} {t("نقطة لكل جنيه بعد استلام الطلب، ويمكن الاستبدال من")}{" "}{s.minRedeemPoints} {t("نقطة.")}</p>
      </div>
      {h.transactions.length ? (
        <div className="rounded-lg border border-line bg-surface">
          <Table>
            <thead><tr><Th>{t("التاريخ")}</Th><Th>{t("العملية")}</Th><Th>{t("الطلب")}</Th><Th>{t("النقاط")}</Th></tr></thead>
            <tbody>
              {h.transactions.map((tx) => (
                <tr key={tx.id}>
                  <Td><DateText value={tx.createdAt} /></Td>
                  <Td>{t(LOYALTY_TX_LABELS[tx.type])}</Td>
                  <Td dir="ltr" className="num text-start">{tx.order?.number ?? "—"}</Td>
                  <Td className={`num ${tx.points > 0 ? "text-success" : "text-danger"}`} dir="ltr">{tx.points > 0 ? `+${tx.points}` : tx.points}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}
