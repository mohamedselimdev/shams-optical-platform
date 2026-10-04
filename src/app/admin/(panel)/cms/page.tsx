import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { toCairoLocal } from "@/lib/cairo-time";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, SelectField, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText } from "@/ui/primitives";
import { ButtonLink } from "@/ui/button";
import { saveCmsAction } from "./actions";

export const metadata = { title: "المحتوى" };

const PLACEMENTS = [{ value: "HOME_HERO", label: "الواجهة الرئيسية" }, { value: "HOME_PROMO", label: "شريط عروض الرئيسية" }, { value: "CATALOG_TOP", label: "أعلى صفحات المنتجات" }];
const SECTION_TYPES = [{ value: "FEATURED_PRODUCTS", label: "منتجات مميزة" }, { value: "NEW_ARRIVALS", label: "وصل حديثاً" }, { value: "BEST_SELLERS", label: "الأكثر مبيعاً" }, { value: "COLLECTION", label: "مجموعة" }, { value: "CATEGORIES", label: "التصنيفات" }, { value: "BRANDS", label: "الماركات" }];

function Entity({ entity, id, children, isNew }: { entity: string; id?: string; children: React.ReactNode; isNew?: boolean }) {
  return (
    <ActionForm action={saveCmsAction} className="grid items-end gap-3 sm:grid-cols-4" resetOnSuccess={isNew}>
      <input type="hidden" name="entity" value={entity} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {children}
      <div className="sm:col-span-4"><SubmitButton size="sm" variant={isNew ? "primary" : "secondary"}>{isNew ? "إضافة" : "حفظ"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function CmsPage() {
  await requireStaffPage("cms.write");
  const [pages, banners, announcements, nav, sections] = await Promise.all([
    db.contentPage.findMany({ orderBy: { updatedAt: "desc" } }),
    db.banner.findMany({ orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] }),
    db.announcement.findMany({ orderBy: { sortOrder: "asc" } }),
    db.navigationItem.findMany({ orderBy: [{ menu: "asc" }, { sortOrder: "asc" }] }),
    db.homeSection.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);
  const banner = (b?: (typeof banners)[number]) => (
    <Entity entity="banner" id={b?.id} isNew={!b}>
      <SelectField label="المكان" name="placement" defaultValue={b?.placement} options={PLACEMENTS} />
      <TextField label="العنوان" name="title" defaultValue={b?.title} required />
      <TextField label="العنوان الفرعي" name="subtitle" defaultValue={b?.subtitle ?? ""} className="sm:col-span-2" />
      <TextField label="نص الزر" name="ctaLabel" defaultValue={b?.ctaLabel ?? ""} />
      <TextField label="رابط الزر" name="ctaHref" defaultValue={b?.ctaHref ?? ""} dir="ltr" placeholder="/collections/..." />
      <TextField label="رابط الصورة" name="imageUrl" defaultValue={b?.imageUrl ?? ""} dir="ltr" className="sm:col-span-2" />
      <TextField label="يبدأ" name="startsAt" type="datetime-local" defaultValue={b?.startsAt ? toCairoLocal(b.startsAt) : ""} />
      <TextField label="ينتهي" name="endsAt" type="datetime-local" defaultValue={b?.endsAt ? toCairoLocal(b.endsAt) : ""} />
      <TextField label="الترتيب" name="sortOrder" defaultValue={b?.sortOrder ?? 0} dir="ltr" />
      <CheckboxField name="isActive" label="نشط" defaultChecked={b?.isActive ?? true} />
    </Entity>
  );
  return (
    <>
      <PageHeader title="المحتوى والتسويق" description="المحتوى يُعرض كعناصر منظمة وليس HTML، لمنع إدخال أكواد ضارة." />
      <div className="space-y-6">
        <Card>
          <CardHeader title="الصفحات" actions={<ButtonLink href="/admin/cms/pages/new" size="sm">صفحة جديدة</ButtonLink>} />
          <ul className="divide-y divide-line">
            {pages.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <Link className="font-medium text-sun-700 hover:underline" href={`/admin/cms/pages/${p.id}`}>{p.title}</Link>
                <span className="num text-xs text-ink-muted">/pages/{p.slug}</span>
                <Badge tone={p.status === "PUBLISHED" ? "success" : "neutral"}>{p.status === "PUBLISHED" ? "منشورة" : "مسودة"}</Badge>
                <span className="ms-auto text-xs text-ink-muted"><DateText value={p.updatedAt} /></span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="البانرات" />
          <CardBody className="space-y-2">
            {banners.map((b) => <details key={b.id} className="rounded-md border border-line p-3"><summary className="cursor-pointer text-sm">{b.title} · {PLACEMENTS.find((p) => p.value === b.placement)?.label} {!b.isActive ? <Badge tone="neutral">متوقف</Badge> : null}</summary><div className="mt-3">{banner(b)}</div></details>)}
            <details className="rounded-md border border-dashed border-line p-3"><summary className="cursor-pointer text-sm text-sun-700">بانر جديد</summary><div className="mt-3">{banner()}</div></details>
          </CardBody>
        </Card>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="شريط الإعلانات" />
            <CardBody className="space-y-3">
              {[...announcements, undefined].map((a, i) => (
                <div key={a?.id ?? `new-${i}`} className={a ? "rounded-md border border-line p-3" : "rounded-md border border-dashed border-line p-3"}>
                  <Entity entity="announcement" id={a?.id} isNew={!a}>
                    <TextField label="النص" name="message" defaultValue={a?.message} className="sm:col-span-2" required />
                    <TextField label="الرابط" name="href" defaultValue={a?.href ?? ""} dir="ltr" />
                    <TextField label="الترتيب" name="sortOrder" defaultValue={a?.sortOrder ?? 0} dir="ltr" />
                    <CheckboxField name="isActive" label="نشط" defaultChecked={a?.isActive ?? true} />
                  </Entity>
                </div>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="أقسام الصفحة الرئيسية" />
            <CardBody className="space-y-3">
              {[...sections, undefined].map((s, i) => {
                const cfg = (s?.config ?? {}) as { collectionSlug?: string; limit?: number };
                return (
                  <div key={s?.id ?? `new-${i}`} className={s ? "rounded-md border border-line p-3" : "rounded-md border border-dashed border-line p-3"}>
                    <Entity entity="home" id={s?.id} isNew={!s}>
                      <SelectField label="النوع" name="type" defaultValue={s?.type} options={SECTION_TYPES} />
                      <TextField label="العنوان" name="title" defaultValue={s?.title} required />
                      <TextField label="رابط المجموعة" name="collectionSlug" defaultValue={cfg.collectionSlug ?? ""} dir="ltr" />
                      <TextField label="العدد" name="limit" defaultValue={cfg.limit ?? 8} dir="ltr" />
                      <TextField label="الترتيب" name="sortOrder" defaultValue={s?.sortOrder ?? 0} dir="ltr" />
                      <CheckboxField name="isActive" label="ظاهر" defaultChecked={s?.isActive ?? true} />
                    </Entity>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="القوائم" />
          <CardBody className="space-y-3">
            {[...nav, undefined].map((n, i) => (
              <div key={n?.id ?? `new-${i}`} className={n ? "rounded-md border border-line p-3" : "rounded-md border border-dashed border-line p-3"}>
                <Entity entity="nav" id={n?.id} isNew={!n}>
                  <SelectField label="القائمة" name="menu" defaultValue={n?.menu} options={[{ value: "HEADER", label: "الرأس" }, { value: "FOOTER", label: "التذييل" }]} />
                  <TextField label="النص" name="label" defaultValue={n?.label} required />
                  <TextField label="الرابط" name="href" defaultValue={n?.href} dir="ltr" required />
                  <SelectField label="تحت عنصر" name="parentId" defaultValue={n?.parentId ?? ""} options={nav.filter((x) => !x.parentId && x.menu === "HEADER" && x.id !== n?.id).map((x) => ({ value: x.id, label: x.label }))} placeholder="—" />
                  <TextField label="الترتيب" name="sortOrder" defaultValue={n?.sortOrder ?? 0} dir="ltr" />
                  <CheckboxField name="isActive" label="ظاهر" defaultChecked={n?.isActive ?? true} />
                </Entity>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
