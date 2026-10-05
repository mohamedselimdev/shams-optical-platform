import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { listReturns } from "@/modules/returns/service";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, DateText, EmptyState, Money, Pagination, Table, Td, Th } from "@/ui/primitives";
import { buttonClass } from "@/ui/button";
import { RETURN_RESOLUTION_LABELS, RETURN_STATUS_LABELS } from "@/i18n/labels";
import { returnTone } from "@/i18n/tones";
import type { ReturnStatus } from "@/generated/prisma/enums";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("المرتجعات") };
}

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("returns.read");
  const sp = await searchParams;
  const status = sp.status && sp.status in RETURN_STATUS_LABELS ? (sp.status as ReturnStatus) : undefined;
  const { items, total, page, pageSize } = await listReturns(actor, { status, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title={t("المرتجعات")} description={t("تُنشأ من حساب العميل أو من صفحة الطلب المسلَّم.")} />
      <Card>
        <form method="get" className="flex gap-2 border-b border-line p-4">
          <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-line bg-surface px-2 text-sm" aria-label={t("الحالة")}>
            <option value="">{t("كل الحالات")}</option>
            {Object.entries(RETURN_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
          <button className={buttonClass("secondary", "sm")}>{t("تصفية")}</button>
        </form>
        {items.length ? (
          <Table>
            <thead><tr><Th>{t("الرقم")}</Th><Th>{t("الطلب")}</Th><Th>{t("العميل")}</Th><Th>{t("البنود")}</Th><Th>{t("الحل")}</Th><Th>{t("الحالة")}</Th><Th>{t("المسترد")}</Th><Th>{t("التاريخ")}</Th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <Td><Link href={`/admin/returns/${r.id}`} className="num font-medium text-sun-700 hover:underline">{r.number}</Link></Td>
                  <Td className="num">{r.order.number}</Td>
                  <Td>{r.customer ? `${r.customer.firstName} ${r.customer.lastName ?? ""}` : t("زائر")}</Td>
                  <Td className="num">{t.number(r._count.items)}</Td>
                  <Td>{t(RETURN_RESOLUTION_LABELS[r.resolution])}</Td>
                  <Td><Badge tone={returnTone[r.status]}>{t(RETURN_STATUS_LABELS[r.status])}</Badge></Td>
                  <Td>{r.refundAmount ? <Money value={r.refundAmount} /> : "—"}</Td>
                  <Td><DateText value={r.createdAt} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title={t("لا توجد مرتجعات")} />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/returns" params={{ status }} />
      </Card>
    </>
  );
}
