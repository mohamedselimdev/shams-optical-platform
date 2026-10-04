import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { listReturns } from "@/modules/returns/service";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, DateText, EmptyState, Money, Pagination, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { buttonClass } from "@/ui/button";
import { RETURN_RESOLUTION_LABELS, RETURN_STATUS_LABELS } from "@/i18n/labels";
import { returnTone } from "@/i18n/tones";
import type { ReturnStatus } from "@/generated/prisma/enums";

export const metadata = { title: "المرتجعات" };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const actor = await requireStaffPage("returns.read");
  const sp = await searchParams;
  const status = sp.status && sp.status in RETURN_STATUS_LABELS ? (sp.status as ReturnStatus) : undefined;
  const { items, total, page, pageSize } = await listReturns(actor, { status, page: Number(sp.page) || 1 });
  return (
    <>
      <PageHeader title="المرتجعات" description="تُنشأ من حساب العميل أو من صفحة الطلب المسلَّم." />
      <Card>
        <form method="get" className="flex gap-2 border-b border-line p-4">
          <select name="status" defaultValue={status ?? ""} className="h-9 rounded-md border border-line bg-surface px-2 text-sm" aria-label="الحالة">
            <option value="">كل الحالات</option>
            {Object.entries(RETURN_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className={buttonClass("secondary", "sm")}>تصفية</button>
        </form>
        {items.length ? (
          <Table>
            <thead><tr><Th>الرقم</Th><Th>الطلب</Th><Th>العميل</Th><Th>البنود</Th><Th>الحل</Th><Th>الحالة</Th><Th>المسترد</Th><Th>التاريخ</Th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <Td><Link href={`/admin/returns/${r.id}`} className="num font-medium text-sun-700 hover:underline">{r.number}</Link></Td>
                  <Td className="num">{r.order.number}</Td>
                  <Td>{r.customer ? `${r.customer.firstName} ${r.customer.lastName ?? ""}` : "زائر"}</Td>
                  <Td className="num">{numberFmt.format(r._count.items)}</Td>
                  <Td>{RETURN_RESOLUTION_LABELS[r.resolution]}</Td>
                  <Td><Badge tone={returnTone[r.status]}>{RETURN_STATUS_LABELS[r.status]}</Badge></Td>
                  <Td>{r.refundAmount ? <Money value={r.refundAmount} /> : "—"}</Td>
                  <Td><DateText value={r.createdAt} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="لا توجد مرتجعات" />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/returns" params={{ status }} />
      </Card>
    </>
  );
}
