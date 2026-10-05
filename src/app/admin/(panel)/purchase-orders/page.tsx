import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listPurchaseOrders } from "@/modules/purchasing/service";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, DateText, EmptyState, Money, Pagination, Table, Td, Th } from "@/ui/primitives";
import { ButtonLink, buttonClass } from "@/ui/button";
import { PO_STATUS_LABELS } from "@/i18n/labels";
import { poTone } from "@/i18n/tones";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("أوامر الشراء") };
}

export default async function PoList({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("purchasing.read");
  const sp = await searchParams;
  const status = sp.status && sp.status in PO_STATUS_LABELS ? (sp.status as PurchaseOrderStatus) : undefined;
  const { items, total, page, pageSize } = await listPurchaseOrders(actor, { status, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title={t("أوامر الشراء")} actions={can(actor, "purchasing.write") ? <ButtonLink href="/admin/purchase-orders/new" size="sm">{t("أمر شراء جديد")}</ButtonLink> : null} />
      <Card>
        <form method="get" className="flex gap-2 border-b border-line p-4">
          <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-line bg-surface px-2 text-sm" aria-label={t("الحالة")}>
            <option value="">{t("كل الحالات")}</option>
            {Object.entries(PO_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <button className={buttonClass("secondary", "sm")}>{t("تصفية")}</button>
        </form>
        {items.length ? (
          <Table>
            <thead><tr><Th>{t("الرقم")}</Th><Th>{t("المورد")}</Th><Th>{t("فرع الاستلام")}</Th><Th>{t("البنود")}</Th><Th>{t("الإجمالي")}</Th><Th>{t("الحالة")}</Th><Th>{t("التاريخ")}</Th></tr></thead>
            <tbody>
              {items.map((po) => (
                <tr key={po.id}>
                  <Td><Link href={`/admin/purchase-orders/${po.id}`} className="num font-medium text-sun-700 hover:underline">{po.number}</Link></Td>
                  <Td>{po.supplier.name}</Td>
                  <Td>{po.branch.name}</Td>
                  <Td className="num">{t.number(po._count.items)}</Td>
                  <Td><Money value={po.subtotal} /></Td>
                  <Td><Badge tone={poTone[po.status]}>{t(PO_STATUS_LABELS[po.status])}</Badge></Td>
                  <Td><DateText value={po.createdAt} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title={t("لا توجد أوامر شراء")} />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/purchase-orders" params={{ status }} />
      </Card>
    </>
  );
}
