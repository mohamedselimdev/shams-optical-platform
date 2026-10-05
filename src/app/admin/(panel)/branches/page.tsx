import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listBranchesFor } from "@/modules/branches/service";
import { PageHeader } from "@/components/admin/page-header";
import { BranchForm } from "@/components/admin/branch-form";
import { Badge, Card, CardBody, CardHeader } from "@/ui/primitives";
import { saveBranchAction } from "./actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("الفروع") };
}

export default async function BranchesPage() {
  const t = await getT();
  const actor = await requireStaffPage("branches.read");
  const branches = await listBranchesFor(actor);
  const canWrite = can(actor, "branches.write");
  return (
    <>
      <PageHeader title={t("الفروع والمخازن")} description={t("الفرع يحدد المخزون والاستلام وصلاحيات الموظفين.")} />
      <div className="space-y-3">
        {branches.map((b) => (
          <Card key={b.id}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-4">
                <span className="font-medium">{b.name}</span>
                <span className="num text-xs text-ink-muted">{b.code}</span>
                <Badge tone={b.type === "WAREHOUSE" ? "info" : "sun"}>{b.type === "WAREHOUSE" ? t("مخزن") : t("فرع بيع")}</Badge>
                {!b.isActive ? <Badge tone="neutral">{t("غير نشط")}</Badge> : null}
                {b.pickupEnabled ? <Badge tone="success">{t("استلام")}</Badge> : null}
                {b.shipsOnline ? <Badge tone="success">{t("شحن أونلاين")}</Badge> : null}
                <span className="ms-auto text-sm text-ink-muted">{t("{0}، {1}", [b.city, t(b.governorate)])}</span>
              </summary>
              <CardBody className="border-t border-line">
                {canWrite ? <BranchForm action={saveBranchAction} branch={b} /> : <p className="text-sm">{b.addressLine} · <span dir="ltr">{b.phone}</span></p>}
              </CardBody>
            </details>
          </Card>
        ))}
      </div>
      {canWrite ? (
        <Card className="mt-6">
          <CardHeader title={t("إضافة فرع أو مخزن")} />
          <CardBody><BranchForm action={saveBranchAction} /></CardBody>
        </Card>
      ) : null}
    </>
  );
}
