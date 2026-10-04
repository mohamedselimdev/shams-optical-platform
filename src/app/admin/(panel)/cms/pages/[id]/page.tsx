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

export const metadata = { title: "تحرير صفحة" };

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage("cms.write");
  const { id } = await params;
  const page = id === "new" ? null : await db.contentPage.findUnique({ where: { id } });
  if (id !== "new" && !page) notFound();
  return (
    <>
      <PageHeader back={{ href: "/admin/cms", label: "المحتوى" }} title={page?.title ?? "صفحة جديدة"} actions={page?.status === "PUBLISHED" ? <Link className="text-sm text-sun-700 hover:underline" href={`/pages/${page.slug}`} target="_blank">عرض ↗</Link> : null} />
      <Card>
        <CardBody>
          <ActionForm action={savePageAction} className="grid gap-4 lg:grid-cols-3">
            {page ? <input type="hidden" name="id" value={page.id} /> : null}
            <div className="space-y-4 lg:col-span-2">
              <TextField label="العنوان" name="title" defaultValue={page?.title} required />
              <TextArea label="المحتوى" name="source" defaultValue={page ? blocksToSource(page.blocks as Block[]) : ""} rows={20} className="font-mono" hint="فقرة لكل سطر فارغ. ## عنوان · ### عنوان فرعي · - عنصر قائمة · > ملاحظة · [نص الزر](/رابط) · ? سؤال | إجابة. لا يُقبل HTML." />
            </div>
            <div className="space-y-4">
              <TextField label="الرابط" name="slug" defaultValue={page?.slug} dir="ltr" required hint="/pages/الرابط" />
              <SelectField label="الحالة" name="status" defaultValue={page?.status ?? "DRAFT"} options={[{ value: "DRAFT", label: "مسودة" }, { value: "PUBLISHED", label: "منشورة" }]} />
              <CheckboxField name="showInFooter" label="إظهار في تذييل الموقع" defaultChecked={page?.showInFooter} />
              <TextField label="عنوان SEO" name="seoTitle" defaultValue={page?.seoTitle ?? ""} />
              <TextArea label="وصف SEO" name="seoDescription" defaultValue={page?.seoDescription ?? ""} rows={3} />
              <SubmitButton className="w-full">حفظ</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
