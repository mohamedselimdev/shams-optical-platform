import { requireStaffPage } from "@/server/auth/session";
import { env } from "@/server/env";
import { systemHealth } from "@/modules/system/health";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, Stat, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { retryJobAction } from "./actions";

export const metadata = { title: "صحة النظام" };

export default async function SystemPage() {
  await requireStaffPage("system.health");
  const { dbMs, failed, stuckPayments, pendingOrders, migrations, workerHealthy, warnings, queued, failedCount } = await systemHealth();
  return (
    <>
      <PageHeader title="صحة النظام" />
      {warnings.length ? <ul className="mb-6 space-y-1 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm">{warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul> : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="قاعدة البيانات" value={`${dbMs} ms`} />
        <Stat label="مهام بالانتظار" value={numberFmt.format(queued)} />
        <Stat label="مهام فاشلة" value={numberFmt.format(failedCount)} />
        <Stat label="مدفوعات معلقة > 30 دقيقة" value={numberFmt.format(stuckPayments)} />
        <Stat label="طلبات بانتظار الدفع" value={numberFmt.format(pendingOrders)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="المهام الفاشلة" />
          <Table>
            <thead><tr><Th>النوع</Th><Th>المحاولات</Th><Th>الخطأ</Th><Th>آخر محاولة</Th><Th></Th></tr></thead>
            <tbody>
              {failed.map((j) => (
                <tr key={j.id}>
                  <Td className="num text-xs">{j.type}</Td>
                  <Td className="num">{j.attempts}</Td>
                  <Td className="max-w-xs truncate text-xs" title={j.lastError ?? ""}>{j.lastError}</Td>
                  <Td><DateText value={j.updatedAt} withTime /></Td>
                  <Td><ActionForm action={retryJobAction} showSuccess={false}><input type="hidden" name="id" value={j.id} /><SubmitButton size="sm" variant="ghost">إعادة</SubmitButton></ActionForm></Td>
                </tr>
              ))}
              {failed.length === 0 ? <tr><Td colSpan={5} className="text-center text-ink-muted">لا توجد مهام فاشلة</Td></tr> : null}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="معلومات" />
          <CardBody className="space-y-2 text-sm">
            <p>البيئة: <Badge tone={env.NODE_ENV === "production" ? "success" : "warning"}>{env.NODE_ENV}</Badge></p>
            <p>العامل الخلفي: <Badge tone={workerHealthy ? "success" : "danger"}>{workerHealthy ? "يعمل" : "متوقف؟"}</Badge></p>
            <p>التخزين: {env.STORAGE_DRIVER}</p>
            <p className="pt-2 text-xs font-semibold text-ink-muted">آخر الترحيلات</p>
            <ul className="num space-y-1 text-xs" dir="ltr">{migrations.map((m) => <li key={m.migration_name}>{m.migration_name} {m.finished_at ? "✓" : "…"}</li>)}</ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
