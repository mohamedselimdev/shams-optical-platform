import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { listCustomers } from "@/modules/customers/service";
import { PageHeader } from "@/components/admin/page-header";
import { Card, DateText, EmptyState, Pagination, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { buttonClass } from "@/ui/button";

export const metadata = { title: "العملاء" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const actor = await requireStaffPage("customers.read");
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 80) || undefined;
  const { items, total, page, pageSize } = await listCustomers(actor, q, Math.max(Number(sp.page) || 1, 1));
  return (
    <>
      <PageHeader title="العملاء" description={`${numberFmt.format(total)} عميل`} />
      <Card>
        <form method="get" className="flex gap-2 border-b border-line p-4">
          <input name="q" defaultValue={q} placeholder="الاسم، الهاتف أو البريد" className="h-9 w-72 rounded-md border border-line bg-surface px-2 text-sm" aria-label="بحث" />
          <button className={buttonClass("secondary", "sm")}>بحث</button>
        </form>
        {items.length ? (
          <Table>
            <thead><tr><Th>العميل</Th><Th>الهاتف</Th><Th>البريد</Th><Th>الطلبات</Th><Th>نقاط الولاء</Th><Th>منذ</Th></tr></thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <Td><Link className="font-medium text-sun-700 hover:underline" href={`/admin/customers/${c.id}`}>{c.firstName} {c.lastName ?? ""}</Link></Td>
                  <Td className="num" dir="ltr">{c.phone ?? "—"}</Td>
                  <Td>{c.email ?? "—"}</Td>
                  <Td className="num">{numberFmt.format(c._count.orders)}</Td>
                  <Td className="num">{numberFmt.format(c.loyalty?.balance ?? 0)}</Td>
                  <Td><DateText value={c.createdAt} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="لا يوجد عملاء مطابقون" />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/customers" params={{ q }} />
      </Card>
    </>
  );
}
