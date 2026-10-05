import { notFound } from "next/navigation";
import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { blocksToSource, type Block } from "@/modules/cms/blocks";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, SelectField, TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Card, CardBody } from "@/ui/primitives";
import { savePageAction } from "../../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("تحرير صفحة") };
}

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  await requireStaffPage("cms.write");
  const { id } = await params;
  const page = id === "new" ? null : await db.contentPage.findUnique({ where: { id } });
  if (id !== "new" && !page) notFound();
  return (
    <>
      <PageHeader back={{ href: "/admin/cms", label: t("المحتوى") }} title={page?.title ?? t("صفحة جديدة")} actions={page?.status === "PUBLISHED" ? <Link className="text-sm text-sun-700 hover:underline" href={`/pages/${page.slug}`} target="_blank">{t("عرض ↗")}</Link> : null} />
      <Card>
        <CardBody>
          <ActionForm action={savePageAction} className="grid gap-4 lg:grid-cols-3">
            {page ? <input type="hidden" name="id" value={page.id} /> : null}
            <div className="space-y-4 lg:col-span-2">
              <TextField label={t("العنوان")} name="title" defaultValue={page?.title} required />
              <TextField label={t("العنوان (إنجليزي)")} name="titleEn" defaultValue={page?.titleEn ?? ""} dir="ltr" />
              <TextArea label={t("المحتوى")} name="source" defaultValue={page ? blocksToSource(page.blocks as Block[]) : ""} rows={20} className="font-mono" hint={t("فقرة لكل سطر فارغ. ## عنوان · ### عنوان فرعي · - عنصر قائمة · > ملاحظة · [نص الزر](/رابط) · ? سؤال | إجابة. لا يُقبل HTML.")} />
              <TextArea label={t("المحتوى (إنجليزي، اختياري)")} name="sourceEn" defaultValue={page?.blocksEn ? blocksToSource(page.blocksEn as Block[]) : ""} rows={12} className="font-mono" dir="ltr" hint={t("يظهر لزوار الموقع بالإنجليزية؛ إذا تُرك فارغاً يظهر المحتوى العربي.")} />
            </div>
            <div className="space-y-4">
              <TextField label={t("الرابط")} name="slug" defaultValue={page?.slug} dir="ltr" required hint={t("/pages/الرابط")} />
              <SelectField label={t("الحالة")} name="status" defaultValue={page?.status ?? "DRAFT"} options={[{ value: "DRAFT", label: t("مسودة") }, { value: "PUBLISHED", label: t("منشورة") }]} />
              <CheckboxField name="showInFooter" label={t("إظهار في تذييل الموقع")} defaultChecked={page?.showInFooter} />
              <TextField label={t("عنوان SEO")} name="seoTitle" defaultValue={page?.seoTitle ?? ""} />
              <TextArea label={t("وصف SEO")} name="seoDescription" defaultValue={page?.seoDescription ?? ""} rows={3} />
              <SubmitButton className="w-full">{t("حفظ")}</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
