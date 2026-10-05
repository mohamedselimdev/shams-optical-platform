import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader } from "@/ui/primitives";
import { saveTaxonomyAction } from "./actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("التصنيفات والماركات") };
}

type Row = { id: string; slug: string; name: string; nameEn: string | null; description: string | null; descriptionEn: string | null; isActive: boolean; sortOrder: number; parentId?: string | null; logoUrl?: string | null; count: number };
type Kind = "category" | "brand" | "collection";

async function TaxForm({ kind, row, parents }: { kind: Kind; row?: Row; parents?: { value: string; label: string }[] }) {
  const t = await getT();
  return (
    <ActionForm action={saveTaxonomyAction} className="grid items-end gap-3 sm:grid-cols-4" resetOnSuccess={!row}>
      <input type="hidden" name="kind" value={kind} />
      {row ? <input type="hidden" name="id" value={row.id} /> : null}
      <TextField label={t("الاسم")} name="name" defaultValue={row?.name} required />
      <TextField label={t("بالإنجليزية")} name="nameEn" defaultValue={row?.nameEn ?? ""} dir="ltr" />
      <TextField label={t("الرابط")} name="slug" defaultValue={row?.slug} dir="ltr" required />
      <TextField label={t("الترتيب")} name="sortOrder" defaultValue={row?.sortOrder ?? 0} dir="ltr" />
      {kind === "category" ? <SelectField label={t("التصنيف الأب")} name="parentId" defaultValue={row?.parentId ?? ""} options={(parents ?? []).filter((p) => p.value !== row?.id)} placeholder={t("بدون (رئيسي)")} /> : null}
      {kind === "brand" ? <TextField label={t("رابط الشعار")} name="logoUrl" defaultValue={row?.logoUrl ?? ""} dir="ltr" /> : null}
      <TextField label={t("الوصف")} name="description" defaultValue={row?.description ?? ""} className="sm:col-span-2" />
      <TextField label={t("الوصف بالإنجليزية")} name="descriptionEn" defaultValue={row?.descriptionEn ?? ""} className="sm:col-span-2" dir="ltr" />
      <CheckboxField name="isActive" label={t("ظاهر في المتجر")} defaultChecked={row?.isActive ?? true} />
      <div className="sm:col-span-4"><SubmitButton size="sm" variant={row ? "secondary" : "primary"}>{row ? t("حفظ") : t("إضافة")}</SubmitButton></div>
    </ActionForm>
  );
}

async function Section({ title, kind, rows, parents }: { title: string; kind: Kind; rows: Row[]; parents?: { value: string; label: string }[] }) {
  const t = await getT();
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="space-y-2">
        {rows.map((r) => (
          <details key={r.id} className="rounded-md border border-line p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-sm">
              {r.name} <span className="num text-xs text-ink-muted">/{r.slug}</span> <span className="text-xs text-ink-muted">{t("{0} منتج", [t.number(r.count)])}</span> {!r.isActive ? <Badge tone="neutral">{t("مخفي")}</Badge> : null}
            </summary>
            <div className="mt-3"><TaxForm kind={kind} row={r} parents={parents} /></div>
          </details>
        ))}
        <details className="rounded-md border border-dashed border-line p-3">
          <summary className="cursor-pointer text-sm text-sun-700">{t("إضافة جديد")}</summary>
          <div className="mt-3"><TaxForm kind={kind} parents={parents} /></div>
        </details>
      </CardBody>
    </Card>
  );
}

export default async function TaxonomyPage() {
  const t = await getT();
  await requireStaffPage("catalog.write");
  const [categories, brands, collections] = await Promise.all([
    db.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } }),
    db.brand.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } }),
    db.collection.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { products: true } } } }),
  ]);
  const map = <T extends { _count: { products: number } }>(rows: T[]) => rows.map((r) => ({ ...r, count: r._count.products }));
  const parents = categories.filter((c) => !c.parentId).map((c) => ({ value: c.id, label: c.name }));
  return (
    <>
      <PageHeader title={t("التصنيفات والماركات والمجموعات")} />
      <div className="grid gap-6 xl:grid-cols-3">
        <Section title={t("التصنيفات")} kind="category" rows={map(categories)} parents={parents} />
        <Section title={t("الماركات")} kind="brand" rows={map(brands)} />
        <Section title={t("المجموعات")} kind="collection" rows={map(collections)} />
      </div>
    </>
  );
}
