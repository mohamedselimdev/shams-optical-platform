import { requireStaffPage } from "@/server/auth/session";
import { listSuppliers } from "@/modules/suppliers/service";
import { PageHeader } from "@/components/admin/page-header";
import { actorBranches } from "@/components/admin/range";
import { SkuLines } from "@/components/admin/sku-lines";
import { ActionForm } from "@/ui/action-form";
import { SelectField, TextArea, TextField } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Card, CardBody } from "@/ui/primitives";
import { createPoAction } from "../actions";

export const metadata = { title: "أمر شراء جديد" };

export default async function NewPo() {
  const actor = await requireStaffPage("purchasing.write");
  const [suppliers, branches] = await Promise.all([listSuppliers(actor), actorBranches(actor)]);
  return (
    <>
      <PageHeader back={{ href: "/admin/purchase-orders", label: "أوامر الشراء" }} title="أمر شراء جديد" />
      <Card className="max-w-3xl">
        <CardBody>
          <ActionForm action={createPoAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label="المورد" name="supplierId" options={suppliers.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name }))} placeholder="اختر" required />
              <SelectField label="فرع الاستلام" name="branchId" options={branches.map((b) => ({ value: b.id, label: b.name }))} required />
              <TextField label="تاريخ التوريد المتوقع" name="expectedAt" type="date" />
            </div>
            <SkuLines withCost label="البنود (التكلفة بالجنيه للوحدة)" />
            <TextArea label="ملاحظات" name="notes" rows={2} />
            <SubmitButton>حفظ كمسودة</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
