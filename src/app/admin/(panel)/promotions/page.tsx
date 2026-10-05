import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can, assertCan } from "@/server/rbac/actor";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, DateText, EmptyState, Money, Table, Td, Th } from "@/ui/primitives";
import { ButtonLink } from "@/ui/button";
import { DISCOUNT_TYPE_LABELS, PROMOTION_SCOPE_LABELS } from "@/i18n/labels";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("العروض والكوبونات") };
}

export default async function PromotionsPage() {
  const t = await getT();
  const actor = await requireStaffPage("promotions.read");
  assertCan(actor, "promotions.read");
  const promos = await db.promotion.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }], include: { _count: { select: { redemptions: { where: { reversedAt: null } } } } } });
  const now = new Date();
  return (
    <>
      <PageHeader title={t("العروض والكوبونات")} description={t("الخصم يُحسب دائماً على الخادم عند الدفع؛ لا يُقبل أي سعر من المتصفح.")} actions={can(actor, "promotions.write") ? <ButtonLink href="/admin/promotions/new" size="sm">{t("عرض جديد")}</ButtonLink> : null} />
      <Card>
        {promos.length ? (
          <Table>
            <thead><tr><Th>{t("العرض")}</Th><Th>{t("الكود")}</Th><Th>{t("الخصم")}</Th><Th>{t("النطاق")}</Th><Th>{t("الاستخدام")}</Th><Th>{t("المدة")}</Th><Th>{t("الحالة")}</Th></tr></thead>
            <tbody>
              {promos.map((p) => {
                const live = p.isActive && (!p.startsAt || p.startsAt <= now) && (!p.endsAt || p.endsAt > now) && (!p.usageLimit || p.usedCount < p.usageLimit);
                return (
                  <tr key={p.id}>
                    <Td><Link className="font-medium text-sun-700 hover:underline" href={`/admin/promotions/${p.id}`}>{p.name}</Link></Td>
                    <Td className="num">{p.code ?? <span className="text-ink-muted">{t("تلقائي")}</span>}</Td>
                    <Td>{p.discountType === "PERCENTAGE" ? `${p.value / 100}%` : p.discountType === "FIXED_AMOUNT" ? <Money value={p.value} /> : t(DISCOUNT_TYPE_LABELS[p.discountType])}</Td>
                    <Td>{t(PROMOTION_SCOPE_LABELS[p.scope])}</Td>
                    <Td className="num">{t.number(p.usedCount)}{p.usageLimit ? ` / ${t.number(p.usageLimit)}` : ""}</Td>
                    <Td className="text-xs">{p.startsAt ? <DateText value={p.startsAt} /> : "—"} ← {p.endsAt ? <DateText value={p.endsAt} /> : t("مفتوح")}</Td>
                    <Td><Badge tone={live ? "success" : "neutral"}>{live ? t("سارٍ") : p.isActive ? t("خارج المدة/الحد") : t("متوقف")}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : <EmptyState title={t("لا توجد عروض")} />}
      </Card>
    </>
  );
}
