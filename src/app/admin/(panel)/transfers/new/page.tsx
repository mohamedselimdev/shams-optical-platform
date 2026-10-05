import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { actorBranches } from "@/components/admin/range";
import { SkuLines } from "@/components/admin/sku-lines";
import { ActionForm } from "@/ui/action-form";
import { SelectField, TextArea } from "@/ui/fields";
import { SubmitButton } from "@/ui/submit-button";
import { Card, CardBody } from "@/ui/primitives";
import { createTransferAction } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("تحويل جديد") };
}

export default async function NewTransfer() {
  const t = await getT();
  const actor = await requireStaffPage("transfers.create");
  const [mine, all] = await Promise.all([actorBranches(actor), db.branch.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  return (
    <>
      <PageHeader back={{ href: "/admin/transfers", label: t("التحويلات") }} title={t("تحويل مخزون جديد")} description={t("تُحجز الكميات في الفرع المصدر فور الإنشاء حتى الشحن أو الإلغاء.")} />
      <Card className="max-w-3xl">
        <CardBody>
          <ActionForm action={createTransferAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label={t("من فرع")} name="fromBranchId" options={mine.map((b) => ({ value: b.id, label: b.name }))} required />
              <SelectField label={t("إلى فرع")} name="toBranchId" options={all.map((b) => ({ value: b.id, label: b.name }))} required />
            </div>
            <SkuLines />
            <TextArea label={t("ملاحظات")} name="notes" rows={2} />
            <SubmitButton>{t("إنشاء التحويل")}</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
