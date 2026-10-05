import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listSuppliers } from "@/modules/suppliers/service";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/ui/primitives";
import { saveSupplierAction } from "./actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("الموردون") };
}

type S = Awaited<ReturnType<typeof listSuppliers>>[number];

async function SupplierForm({ s }: { s?: S }) {
  const t = await getT();
  return (
    <ActionForm action={saveSupplierAction} className="grid gap-3 sm:grid-cols-3" resetOnSuccess={!s}>
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <TextField label={t("الاسم")} name="name" defaultValue={s?.name} required />
      <TextField label={t("الكود")} name="code" defaultValue={s?.code} dir="ltr" required />
      <TextField label={t("مسؤول التواصل")} name="contactName" defaultValue={s?.contactName ?? ""} />
      <TextField label={t("الهاتف")} name="phone" defaultValue={s?.phone ?? ""} dir="ltr" />
      <TextField label={t("البريد")} name="email" defaultValue={s?.email ?? ""} dir="ltr" />
      <TextField label={t("الرقم الضريبي")} name="taxId" defaultValue={s?.taxId ?? ""} dir="ltr" />
      <TextField label={t("العنوان")} name="address" defaultValue={s?.address ?? ""} className="sm:col-span-2" />
      <TextField label={t("شروط الدفع")} name="paymentTerms" defaultValue={s?.paymentTerms ?? ""} placeholder={t("آجل 30 يوم")} />
      <TextArea label={t("ملاحظات")} name="notes" defaultValue={s?.notes ?? ""} rows={2} className="sm:col-span-3" />
      <CheckboxField name="isActive" label={t("نشط")} defaultChecked={s?.isActive ?? true} />
      <div className="sm:col-span-3"><SubmitButton size="sm">{s ? t("حفظ") : t("إضافة المورد")}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("suppliers.read");
  const { q } = await searchParams;
  const suppliers = await listSuppliers(actor, q?.trim().slice(0, 80) || undefined);
  const canWrite = can(actor, "suppliers.write");
  return (
    <>
      <PageHeader title={t("الموردون")} actions={<form method="get"><input name="q" defaultValue={q} placeholder={t("بحث بالاسم أو الكود")} className="h-9 rounded-md border border-line bg-surface px-2 text-sm" aria-label={t("بحث")} /></form>} />
      <div className="space-y-3">
        {suppliers.map((s) => (
          <Card key={s.id}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-4">
                <span className="font-medium">{s.name}</span>
                <span className="num text-xs text-ink-muted">{s.code}</span>
                {!s.isActive ? <Badge tone="neutral">{t("غير نشط")}</Badge> : null}
                <span className="ms-auto text-xs text-ink-muted">{t("{0} منتج · {1} أمر شراء", [t.number(s._count.products), t.number(s._count.orders)])}</span>
              </summary>
              <CardBody className="border-t border-line">{canWrite ? <SupplierForm s={s} /> : <p className="text-sm">{s.contactName} · <span dir="ltr">{s.phone}</span></p>}</CardBody>
            </details>
          </Card>
        ))}
        {suppliers.length === 0 ? <EmptyState title={t("لا يوجد موردون")} /> : null}
      </div>
      {canWrite ? (
        <Card className="mt-6">
          <CardHeader title={t("مورد جديد")} />
          <CardBody><SupplierForm /></CardBody>
        </Card>
      ) : null}
    </>
  );
}
