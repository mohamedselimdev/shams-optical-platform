import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listSuppliers } from "@/modules/suppliers/service";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { CheckboxField, TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, EmptyState, numberFmt } from "@/ui/primitives";
import { saveSupplierAction } from "./actions";

export const metadata = { title: "الموردون" };

type S = Awaited<ReturnType<typeof listSuppliers>>[number];

function SupplierForm({ s }: { s?: S }) {
  return (
    <ActionForm action={saveSupplierAction} className="grid gap-3 sm:grid-cols-3" resetOnSuccess={!s}>
      {s ? <input type="hidden" name="id" value={s.id} /> : null}
      <TextField label="الاسم" name="name" defaultValue={s?.name} required />
      <TextField label="الكود" name="code" defaultValue={s?.code} dir="ltr" required />
      <TextField label="مسؤول التواصل" name="contactName" defaultValue={s?.contactName ?? ""} />
      <TextField label="الهاتف" name="phone" defaultValue={s?.phone ?? ""} dir="ltr" />
      <TextField label="البريد" name="email" defaultValue={s?.email ?? ""} dir="ltr" />
      <TextField label="الرقم الضريبي" name="taxId" defaultValue={s?.taxId ?? ""} dir="ltr" />
      <TextField label="العنوان" name="address" defaultValue={s?.address ?? ""} className="sm:col-span-2" />
      <TextField label="شروط الدفع" name="paymentTerms" defaultValue={s?.paymentTerms ?? ""} placeholder="آجل 30 يوم" />
      <TextArea label="ملاحظات" name="notes" defaultValue={s?.notes ?? ""} rows={2} className="sm:col-span-3" />
      <CheckboxField name="isActive" label="نشط" defaultChecked={s?.isActive ?? true} />
      <div className="sm:col-span-3"><SubmitButton size="sm">{s ? "حفظ" : "إضافة المورد"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireStaffPage("suppliers.read");
  const { q } = await searchParams;
  const suppliers = await listSuppliers(actor, q?.trim().slice(0, 80) || undefined);
  const canWrite = can(actor, "suppliers.write");
  return (
    <>
      <PageHeader title="الموردون" actions={<form method="get"><input name="q" defaultValue={q} placeholder="بحث بالاسم أو الكود" className="h-9 rounded-md border border-line bg-surface px-2 text-sm" aria-label="بحث" /></form>} />
      <div className="space-y-3">
        {suppliers.map((s) => (
          <Card key={s.id}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-4">
                <span className="font-medium">{s.name}</span>
                <span className="num text-xs text-ink-muted">{s.code}</span>
                {!s.isActive ? <Badge tone="neutral">غير نشط</Badge> : null}
                <span className="ms-auto text-xs text-ink-muted">{numberFmt.format(s._count.products)} منتج · {numberFmt.format(s._count.orders)} أمر شراء</span>
              </summary>
              <CardBody className="border-t border-line">{canWrite ? <SupplierForm s={s} /> : <p className="text-sm">{s.contactName} · <span dir="ltr">{s.phone}</span></p>}</CardBody>
            </details>
          </Card>
        ))}
        {suppliers.length === 0 ? <EmptyState title="لا يوجد موردون" /> : null}
      </div>
      {canWrite ? (
        <Card className="mt-6">
          <CardHeader title="مورد جديد" />
          <CardBody><SupplierForm /></CardBody>
        </Card>
      ) : null}
    </>
  );
}
