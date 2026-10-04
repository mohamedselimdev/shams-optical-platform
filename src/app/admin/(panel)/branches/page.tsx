import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listBranchesFor } from "@/modules/branches/service";
import { PageHeader } from "@/components/admin/page-header";
import { BranchForm } from "@/components/admin/branch-form";
import { Badge, Card, CardBody, CardHeader } from "@/ui/primitives";
import { saveBranchAction } from "./actions";

export const metadata = { title: "الفروع" };

export default async function BranchesPage() {
  const actor = await requireStaffPage("branches.read");
  const branches = await listBranchesFor(actor);
  const canWrite = can(actor, "branches.write");
  return (
    <>
      <PageHeader title="الفروع والمخازن" description="الفرع يحدد المخزون والاستلام وصلاحيات الموظفين." />
      <div className="space-y-3">
        {branches.map((b) => (
          <Card key={b.id}>
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-4">
                <span className="font-medium">{b.name}</span>
                <span className="num text-xs text-ink-muted">{b.code}</span>
                <Badge tone={b.type === "WAREHOUSE" ? "info" : "sun"}>{b.type === "WAREHOUSE" ? "مخزن" : "فرع بيع"}</Badge>
                {!b.isActive ? <Badge tone="neutral">غير نشط</Badge> : null}
                {b.pickupEnabled ? <Badge tone="success">استلام</Badge> : null}
                {b.shipsOnline ? <Badge tone="success">شحن أونلاين</Badge> : null}
                <span className="ms-auto text-sm text-ink-muted">{b.city}، {b.governorate}</span>
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
          <CardHeader title="إضافة فرع أو مخزن" />
          <CardBody><BranchForm action={saveBranchAction} /></CardBody>
        </Card>
      ) : null}
    </>
  );
}
