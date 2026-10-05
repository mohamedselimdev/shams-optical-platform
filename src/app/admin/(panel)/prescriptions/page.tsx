import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { staffListPrescriptions } from "@/modules/prescriptions/service";
import { PageHeader } from "@/components/admin/page-header";
import { Badge, Card, DateText, EmptyState, Pagination, Table, Td, Th } from "@/ui/primitives";
import { PRESCRIPTION_STATUS_LABELS } from "@/i18n/labels";
import { rxTone } from "@/i18n/tones";
import { cn } from "@/ui/cn";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("الوصفات الطبية") };
}

export default async function RxList({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("prescriptions.read");
  const sp = await searchParams;
  const status = sp.status === "all" ? undefined : sp.status && sp.status in PRESCRIPTION_STATUS_LABELS ? (sp.status as "VERIFIED") : "PENDING_REVIEW";
  const { items, total, page, pageSize } = await staffListPrescriptions(actor, { status, page: Number(sp.page) || 1 });
  const tabs = [["PENDING_REVIEW", t("بانتظار المراجعة")], ["VERIFIED", t("معتمدة")], ["REJECTED", t("مرفوضة")], ["all", t("الكل")]];
  return (
    <>
      <PageHeader title={t("الوصفات الطبية")} description={t("بيانات صحية حساسة: القيم لا تظهر في القوائم، والاطلاع عليها يُسجَّل في سجل التدقيق.")} />
      <nav className="mb-4 flex gap-1 border-b border-line">
        {tabs.map(([k, l]) => (
          <Link key={k} href={`/admin/prescriptions?status=${k}`} className={cn("-mb-px border-b-2 px-4 py-2 text-sm", (status ?? "all") === k ? "border-sun-500 font-medium" : "border-transparent text-ink-muted")}>{l}</Link>
        ))}
      </nav>
      <Card>
        {items.length ? (
          <Table>
            <thead><tr><Th>{t("العميل")}</Th><Th>{t("الوصفة")}</Th><Th>{t("المصدر")}</Th><Th>{t("الحالة")}</Th><Th>{t("التاريخ")}</Th><Th></Th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <Td>{r.customer.firstName} {r.customer.lastName ?? ""}</Td>
                  <Td>{r.label}</Td>
                  <Td>{r.fileId ? t("صورة مرفوعة") : t("قيم مُدخلة")}</Td>
                  <Td><Badge tone={rxTone[r.status]}>{t(PRESCRIPTION_STATUS_LABELS[r.status])}</Badge></Td>
                  <Td><DateText value={r.createdAt} withTime /></Td>
                  <Td><Link className="text-sm text-sun-700 hover:underline" href={`/admin/prescriptions/${r.id}`}>{t("فتح")}</Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title={t("لا توجد وصفات")} />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/prescriptions" params={{ status: sp.status }} />
      </Card>
    </>
  );
}
