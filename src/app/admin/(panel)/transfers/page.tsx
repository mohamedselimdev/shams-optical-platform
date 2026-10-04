import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listTransfers } from "@/modules/transfers/service";
import { PageHeader } from "@/components/admin/page-header";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { Badge, Card, DateText, EmptyState, Pagination, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { ButtonLink, buttonClass } from "@/ui/button";
import { TRANSFER_STATUS_LABELS } from "@/i18n/labels";
import { transferTone } from "@/i18n/tones";
import type { TransferStatus } from "@/generated/prisma/enums";

export const metadata = { title: "تحويلات المخزون" };

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const actor = await requireStaffPage("inventory.read");
  const sp = await searchParams;
  const status = sp.status && sp.status in TRANSFER_STATUS_LABELS ? (sp.status as TransferStatus) : undefined;
  const { items, total, page, pageSize } = await listTransfers(actor, { status, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="تحويلات المخزون" actions={can(actor, "transfers.create") ? <ButtonLink href="/admin/transfers/new" size="sm">تحويل جديد</ButtonLink> : null} />
      <InventoryTabs active="transfers" />
      <Card>
        <form method="get" className="flex gap-2 border-b border-line p-4">
          <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-line bg-surface px-2 text-sm" aria-label="الحالة">
            <option value="">كل الحالات</option>
            {Object.entries(TRANSFER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className={buttonClass("secondary", "sm")}>تصفية</button>
        </form>
        {items.length ? (
          <Table>
            <thead><tr><Th>الرقم</Th><Th>من</Th><Th>إلى</Th><Th>البنود</Th><Th>الحالة</Th><Th>التاريخ</Th></tr></thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <Td><Link href={`/admin/transfers/${t.id}`} className="num font-medium text-sun-700 hover:underline">{t.number}</Link></Td>
                  <Td>{t.fromBranch.name}</Td>
                  <Td>{t.toBranch.name}</Td>
                  <Td className="num">{numberFmt.format(t._count.items)}</Td>
                  <Td><Badge tone={transferTone[t.status]}>{TRANSFER_STATUS_LABELS[t.status]}</Badge></Td>
                  <Td><DateText value={t.createdAt} withTime /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="لا توجد تحويلات" />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/transfers" params={{ status }} />
      </Card>
    </>
  );
}
