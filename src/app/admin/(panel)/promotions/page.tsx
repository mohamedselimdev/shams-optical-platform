import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can, assertCan } from "@/server/rbac/actor";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, DateText, EmptyState, Money, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { ButtonLink } from "@/ui/button";
import { DISCOUNT_TYPE_LABELS, PROMOTION_SCOPE_LABELS } from "@/i18n/labels";

export const metadata = { title: "العروض والكوبونات" };

export default async function PromotionsPage() {
  const actor = await requireStaffPage("promotions.read");
  assertCan(actor, "promotions.read");
  const promos = await db.promotion.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }], include: { _count: { select: { redemptions: { where: { reversedAt: null } } } } } });
  const now = new Date();
  return (
    <>
      <PageHeader title="العروض والكوبونات" description="الخصم يُحسب دائماً على الخادم عند الدفع؛ لا يُقبل أي سعر من المتصفح." actions={can(actor, "promotions.write") ? <ButtonLink href="/admin/promotions/new" size="sm">عرض جديد</ButtonLink> : null} />
      <Card>
        {promos.length ? (
          <Table>
            <thead><tr><Th>العرض</Th><Th>الكود</Th><Th>الخصم</Th><Th>النطاق</Th><Th>الاستخدام</Th><Th>المدة</Th><Th>الحالة</Th></tr></thead>
            <tbody>
              {promos.map((p) => {
                const live = p.isActive && (!p.startsAt || p.startsAt <= now) && (!p.endsAt || p.endsAt > now) && (!p.usageLimit || p.usedCount < p.usageLimit);
                return (
                  <tr key={p.id}>
                    <Td><Link className="font-medium text-sun-700 hover:underline" href={`/admin/promotions/${p.id}`}>{p.name}</Link></Td>
                    <Td className="num">{p.code ?? <span className="text-ink-muted">تلقائي</span>}</Td>
                    <Td>{p.discountType === "PERCENTAGE" ? `${p.value / 100}%` : p.discountType === "FIXED_AMOUNT" ? <Money value={p.value} /> : DISCOUNT_TYPE_LABELS[p.discountType]}</Td>
                    <Td>{PROMOTION_SCOPE_LABELS[p.scope]}</Td>
                    <Td className="num">{numberFmt.format(p.usedCount)}{p.usageLimit ? ` / ${numberFmt.format(p.usageLimit)}` : ""}</Td>
                    <Td className="text-xs">{p.startsAt ? <DateText value={p.startsAt} /> : "—"} ← {p.endsAt ? <DateText value={p.endsAt} /> : "مفتوح"}</Td>
                    <Td><Badge tone={live ? "success" : "neutral"}>{live ? "سارٍ" : p.isActive ? "خارج المدة/الحد" : "متوقف"}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : <EmptyState title="لا توجد عروض" />}
      </Card>
    </>
  );
}
