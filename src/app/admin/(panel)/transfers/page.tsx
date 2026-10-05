import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listTransfers } from "@/modules/transfers/service";
import { PageHeader } from "@/components/admin/page-header";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { Badge, Card, DateText, EmptyState, Pagination, Table, Td, Th } from "@/ui/primitives";
import { ButtonLink, buttonClass } from "@/ui/button";
import { TRANSFER_STATUS_LABELS } from "@/i18n/labels";
import { transferTone } from "@/i18n/tones";
import type { TransferStatus } from "@/generated/prisma/enums";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("تحويلات المخزون") };
}

export default async function TransfersPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("inventory.read");
  const sp = await searchParams;
  const status = sp.status && sp.status in TRANSFER_STATUS_LABELS ? (sp.status as TransferStatus) : undefined;
  const { items, total, page, pageSize } = await listTransfers(actor, { status, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title={t("تحويلات المخزون")} actions={can(actor, "transfers.create") ? <ButtonLink href="/admin/transfers/new" size="sm">{t("تحويل جديد")}</ButtonLink> : null} />
      <InventoryTabs active="transfers" />
      <Card>
        <form method="get" className="flex gap-2 border-b border-line p-4">
          <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-line bg-surface px-2 text-sm" aria-label={t("الحالة")}>
            <option value="">{t("كل الحالات")}</option>
            {Object.entries(TRANSFER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <button className={buttonClass("secondary", "sm")}>{t("تصفية")}</button>
        </form>
        {items.length ? (
          <Table>
            <thead><tr><Th>{t("الرقم")}</Th><Th>{t("من")}</Th><Th>{t("إلى")}</Th><Th>{t("البنود")}</Th><Th>{t("الحالة")}</Th><Th>{t("التاريخ")}</Th></tr></thead>
            <tbody>
              {items.map((transfer) => (
                <tr key={transfer.id}>
                  <Td><Link href={`/admin/transfers/${transfer.id}`} className="num font-medium text-sun-700 hover:underline">{transfer.number}</Link></Td>
                  <Td>{transfer.fromBranch.name}</Td>
                  <Td>{transfer.toBranch.name}</Td>
                  <Td className="num">{t.number(transfer._count.items)}</Td>
                  <Td><Badge tone={transferTone[transfer.status]}>{t(TRANSFER_STATUS_LABELS[transfer.status])}</Badge></Td>
                  <Td><DateText value={transfer.createdAt} withTime /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title={t("لا توجد تحويلات")} />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/transfers" params={{ status }} />
      </Card>
    </>
  );
}
