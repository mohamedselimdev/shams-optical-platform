import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listPurchaseOrders } from "@/modules/purchasing/service";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, DateText, EmptyState, Money, Pagination, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { ButtonLink, buttonClass } from "@/ui/button";
import { PO_STATUS_LABELS } from "@/i18n/labels";
import { poTone } from "@/i18n/tones";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";

export const metadata = { title: "أوامر الشراء" };

export default async function PoList({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const actor = await requireStaffPage("purchasing.read");
  const sp = await searchParams;
  const status = sp.status && sp.status in PO_STATUS_LABELS ? (sp.status as PurchaseOrderStatus) : undefined;
  const { items, total, page, pageSize } = await listPurchaseOrders(actor, { status, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="أوامر الشراء" actions={can(actor, "purchasing.write") ? <ButtonLink href="/admin/purchase-orders/new" size="sm">أمر شراء جديد</ButtonLink> : null} />
      <Card>
        <form method="get" className="flex gap-2 border-b border-line p-4">
          <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-line bg-surface px-2 text-sm" aria-label="الحالة">
            <option value="">كل الحالات</option>
            {Object.entries(PO_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className={buttonClass("secondary", "sm")}>تصفية</button>
        </form>
        {items.length ? (
          <Table>
            <thead><tr><Th>الرقم</Th><Th>المورد</Th><Th>فرع الاستلام</Th><Th>البنود</Th><Th>الإجمالي</Th><Th>الحالة</Th><Th>التاريخ</Th></tr></thead>
            <tbody>
              {items.map((po) => (
                <tr key={po.id}>
                  <Td><Link href={`/admin/purchase-orders/${po.id}`} className="num font-medium text-sun-700 hover:underline">{po.number}</Link></Td>
                  <Td>{po.supplier.name}</Td>
                  <Td>{po.branch.name}</Td>
                  <Td className="num">{numberFmt.format(po._count.items)}</Td>
                  <Td><Money value={po.subtotal} /></Td>
                  <Td><Badge tone={poTone[po.status]}>{PO_STATUS_LABELS[po.status]}</Badge></Td>
                  <Td><DateText value={po.createdAt} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="لا توجد أوامر شراء" />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/purchase-orders" params={{ status }} />
      </Card>
    </>
  );
}
