import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { listPayments } from "@/modules/payments/service";
import { db } from "@/server/db";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardHeader, DateText, EmptyState, Money, Pagination, Table, Td, Th } from "@/ui/primitives";
import { buttonClass } from "@/ui/button";
import { ATTEMPT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/i18n/labels";
import { attemptTone } from "@/i18n/tones";
import { reconcileAction } from "./actions";

export const metadata = { title: "المدفوعات" };

const PROVIDERS = ["sandbox", "paymob", "cod", "branch", "pos_cash", "pos_card"];

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ status?: string; provider?: string; page?: string }> }) {
  const actor = await requireStaffPage("payments.read");
  const sp = await searchParams;
  const status = sp.status && sp.status in ATTEMPT_STATUS_LABELS ? sp.status : undefined;
  const provider = sp.provider && PROVIDERS.includes(sp.provider) ? sp.provider : undefined;
  const [{ items, total, page, pageSize }, webhooks] = await Promise.all([
    listPayments(actor, { status, provider, page: Number(sp.page) || 1 }),
    can(actor, "payments.reconcile") ? db.webhookEvent.findMany({ orderBy: { receivedAt: "desc" }, take: 15, select: { id: true, provider: true, eventId: true, eventType: true, signatureValid: true, status: true, error: true, receivedAt: true } }) : Promise.resolve(null),
  ]);
  const input = "h-9 rounded-md border border-line bg-surface px-2 text-sm";
  return (
    <>
      <PageHeader
        title="المدفوعات"
        description="تأكيد الدفع الإلكتروني يتم فقط عبر إشعار موقّع من مزود الدفع، وليس من صفحة العودة في المتصفح."
        actions={can(actor, "payments.reconcile") ? <ActionForm action={reconcileAction}><SubmitButton size="sm" variant="secondary" pendingLabel="جارٍ المطابقة…">مطابقة العمليات المعلقة</SubmitButton></ActionForm> : null}
      />
      <Card>
        <form method="get" className="flex flex-wrap gap-2 border-b border-line p-4">
          <select name="status" defaultValue={status ?? ""} className={input} aria-label="الحالة">
            <option value="">كل الحالات</option>
            {Object.entries(ATTEMPT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select name="provider" defaultValue={provider ?? ""} className={input} aria-label="المزود">
            <option value="">كل المزودين</option>
            {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className={buttonClass("secondary", "sm")}>تصفية</button>
        </form>
        {items.length ? (
          <Table>
            <thead><tr><Th>الطلب</Th><Th>الطريقة</Th><Th>المزود</Th><Th>الحالة</Th><Th>المبلغ</Th><Th>المسترد</Th><Th>التاريخ</Th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <Td><Link className="num text-sun-700 hover:underline" href={`/admin/orders/${p.order.id}`}>{p.order.number}</Link></Td>
                  <Td>{PAYMENT_METHOD_LABELS[p.method]}</Td>
                  <Td className="num text-xs">{p.provider}</Td>
                  <Td><Badge tone={attemptTone[p.status]}>{ATTEMPT_STATUS_LABELS[p.status]}</Badge>{p.failureReason ? <span className="block text-xs text-danger">{p.failureReason}</span> : null}</Td>
                  <Td><Money value={p.amount} /></Td>
                  <Td>{p.refundedAmount ? <Money value={p.refundedAmount} /> : "—"}</Td>
                  <Td><DateText value={p.createdAt} withTime /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <EmptyState title="لا توجد عمليات دفع" />}
        <Pagination page={page} pageCount={Math.ceil(total / pageSize)} basePath="/admin/payments" params={{ status, provider }} />
      </Card>
      {webhooks ? (
        <Card className="mt-6">
          <CardHeader title="آخر إشعارات مزودي الدفع (Webhooks)" description="كل إشعار يُعالج مرة واحدة فقط حتى لو أُعيد إرساله." />
          <Table>
            <thead><tr><Th>المزود</Th><Th>المعرّف</Th><Th>النوع</Th><Th>النتيجة</Th><Th>الوقت</Th></tr></thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id}>
                  <Td className="num text-xs">{w.provider}</Td>
                  <Td className="num text-xs" dir="ltr">{w.eventId}</Td>
                  <Td>{w.eventType ?? "—"}{!w.signatureValid ? <Badge tone="danger" className="ms-1">توقيع غير صالح</Badge> : null}</Td>
                  <Td><Badge tone={w.status === "PROCESSED" ? "success" : w.status === "FAILED" ? "danger" : "neutral"}>{w.status}</Badge>{w.error ? <span className="block text-xs text-danger">{w.error}</span> : null}</Td>
                  <Td><DateText value={w.receivedAt} withTime /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
