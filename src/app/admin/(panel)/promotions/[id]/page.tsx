import { notFound } from "next/navigation";
import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { PromotionForm } from "@/components/admin/promotion-form";
import { promotionTargets, promotionValues } from "@/components/admin/promotion-data";
import { Card, CardHeader, DateText, Money, Table, Td, Th } from "@/ui/primitives";
import { savePromotionAction } from "../actions";

export const metadata = { title: "تعديل عرض" };

export default async function EditPromotion({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("promotions.write");
  const { id } = await params;
  const p = await db.promotion.findUnique({ where: { id } });
  if (!p) notFound();
  const redemptions = await db.promotionRedemption.findMany({ where: { promotionId: id }, include: { order: { select: { number: true } } }, orderBy: { createdAt: "desc" }, take: 20 });
  return (
    <>
      <PageHeader back={{ href: "/admin/promotions", label: "العروض" }} title={p.name} />
      <PromotionForm action={savePromotionAction} initial={promotionValues(p)} targets={await promotionTargets()} />
      <Card className="mt-6">
        <CardHeader title="آخر الاستخدامات" />
        <Table>
          <thead><tr><Th>الطلب</Th><Th>الخصم</Th><Th>التاريخ</Th><Th>الحالة</Th></tr></thead>
          <tbody>
            {redemptions.map((r) => (
              <tr key={r.id}><Td className="num">{r.order.number}</Td><Td><Money value={r.amount} /></Td><Td><DateText value={r.createdAt} withTime /></Td><Td>{r.reversedAt ? "أُلغي" : "مطبَّق"}</Td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
