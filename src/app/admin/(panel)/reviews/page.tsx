import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, DateText, EmptyState } from "@/ui/primitives";
import { REVIEW_STATUS_LABELS } from "@/i18n/labels";
import { moderateAction } from "./actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("التقييمات") };
}

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const t = await getT();
  await requireStaffPage("reviews.moderate");
  const { status: s } = await searchParams;
  const status = s && s in REVIEW_STATUS_LABELS ? (s as "PENDING") : "PENDING";
  const reviews = await db.review.findMany({ where: { status }, include: { product: { select: { name: true } }, customer: { select: { firstName: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title={t("التقييمات")} description={t("لا يُنشر تقييم قبل مراجعته.")} actions={
        <form method="get" className="flex gap-2">
          <select name="status" defaultValue={status} className="h-9 rounded-md border border-line bg-surface px-2 text-sm" aria-label={t("الحالة")}>
            {Object.entries(REVIEW_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <button className="h-9 rounded-md border border-line px-3 text-sm">{t("عرض")}</button>
        </form>
      } />
      <div className="space-y-3">
        {reviews.map((r) => (
          <Card key={r.id}>
            <CardBody className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-2xl">
                <p className="text-sm text-ink-muted">{r.product.name} · {r.customer.firstName} · <DateText value={r.createdAt} /> {r.verifiedPurchase ? <Badge tone="success">{t("شراء موثّق")}</Badge> : null}</p>
                <p className="mt-1 text-sun-500" aria-label={t("{0} من 5", [r.rating])}>{"★".repeat(r.rating)}<span className="text-line-strong">{"★".repeat(5 - r.rating)}</span></p>
                {r.title ? <p className="font-medium">{r.title}</p> : null}
                {r.body ? <p className="mt-1 whitespace-pre-line text-sm">{r.body}</p> : null}
              </div>
              <ActionForm action={moderateAction} className="flex gap-2" showSuccess={false}>
                <input type="hidden" name="id" value={r.id} />
                {r.status !== "APPROVED" ? <SubmitButton size="sm" name="status" value="APPROVED">{t("نشر")}</SubmitButton> : null}
                {r.status !== "REJECTED" ? <SubmitButton size="sm" variant="secondary" name="status" value="REJECTED">{t("رفض")}</SubmitButton> : null}
              </ActionForm>
            </CardBody>
          </Card>
        ))}
        {reviews.length === 0 ? <EmptyState title={t("لا توجد تقييمات في هذه الحالة")} /> : null}
      </div>
    </>
  );
}
