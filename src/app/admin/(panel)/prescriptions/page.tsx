import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { staffListPrescriptions } from "@/modules/prescriptions/service";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, DateText, EmptyState, Pagination, Table, Td, Th } from "@/ui/primitives";
import { PRESCRIPTION_STATUS_LABELS } from "@/i18n/labels";
import { rxTone } from "@/i18n/tones";
import { cn } from "@/ui/cn";

export const metadata = { title: "الوصفات الطبية" };

export default async function RxList({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const actor = await requireStaffPage("prescriptions.read");
  const sp = await searchParams;
  const status = sp.status === "all" ? undefined : sp.status && sp.status in PRESCRIPTION_STATUS_LABELS ? (sp.status as "VERIFIED") : "PENDING_REVIEW";
  const { items, total, page, pageSize } = await staffListPrescriptions(actor, { status, page: Number(sp.page) || 1 });
  const tabs = [["PENDING_REVIEW", "بانتظار المراجعة"], ["VERIFIED", "معتمدة"], ["REJECTED", "مرفوضة"], ["all", "الكل"]];
  return (
    <>
      <PageHeader title="الوصفات الطبية" description="بيانات صحية حساسة: القيم لا تظهر في القوائم، والاطلاع عليها يُسجَّل في سجل التدقيق." />
      <nav className="mb-4 flex gap-1 border-b border-line">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/admin/prescriptions?status=${k}`} className={cn("-mb-px border-b-2 px-4 py-2 text-sm", (status ?? "all") === k ? "border-sun-500 font-medium" : "border-transparent text-ink-muted")}>{l}</Link>
        ))}
      </nav>
      <Card>
        {items.length ? (
          <Table>
            <thead><tr><Th>العميل</Th><Th>الوصفة</Th><Th>المصدر</Th><Th>الحالة</Th><Th>التاريخ</Th><Th></Th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <Td>{r.customer.firstName} {r.customer.lastName ?? ""}</Td>
                  <Td>{r.label}</Td>
                  <Td>{r.fileId ? "صورة مرفوعة" : "قيم مُدخلة"}</Td>
                  <Td><Badge tone={rxTone[r.status]}>{PRESCRIPTION_STATUS_LABELS[r.status]}</Badge></Td>
                  <Td><DateText value={r.createdAt} withTime /></Td>
                  <Td><Link className="text-sm text-sun-700 hover:underline" href={`/admin/prescriptions/${r.id}`}>فتح</Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="لا توجد وصفات" />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/prescriptions" params={{ status: sp.status }} />
      </Card>
    </>
  );
}
