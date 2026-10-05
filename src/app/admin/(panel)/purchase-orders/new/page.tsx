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
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("أمر شراء جديد") };
}

export default async function NewPo() {
  const t = await getT();
  const actor = await requireStaffPage("purchasing.write");
  const [suppliers, branches] = await Promise.all([listSuppliers(actor), actorBranches(actor)]);
  return (
    <>
      <PageHeader back={{ href: "/admin/purchase-orders", label: t("أوامر الشراء") }} title={t("أمر شراء جديد")} />
      <Card className="max-w-3xl">
        <CardBody>
          <ActionForm action={createPoAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <SelectField label={t("المورد")} name="supplierId" options={suppliers.filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name }))} placeholder={t("اختر")} required />
              <SelectField label={t("فرع الاستلام")} name="branchId" options={branches.map((b) => ({ value: b.id, label: b.name }))} required />
              <TextField label={t("تاريخ التوريد المتوقع")} name="expectedAt" type="date" />
            </div>
            <SkuLines withCost label={t("البنود (التكلفة بالجنيه للوحدة)")} />
            <TextArea label={t("ملاحظات")} name="notes" rows={2} />
            <SubmitButton>{t("حفظ كمسودة")}</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
