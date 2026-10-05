import { requireStaffPage } from "@/server/auth/session";
import { env } from "@/server/env";
import { systemHealth } from "@/modules/system/health";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, Stat, Table, Td, Th } from "@/ui/primitives";
import { retryJobAction } from "./actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("صحة النظام") };
}

export default async function SystemPage() {
  const t = await getT();
  await requireStaffPage("system.health");
  const { dbMs, failed, stuckPayments, pendingOrders, migrations, workerHealthy, warnings, queued, failedCount } = await systemHealth();
  return (
    <>
      <PageHeader title={t("صحة النظام")} />
      {warnings.length ? <ul className="mb-6 space-y-1 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm">{warnings.map((w) => <li key={w}>⚠ {t(w)}</li>)}</ul> : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label={t("قاعدة البيانات")} value={`${dbMs} ms`} />
        <Stat label={t("مهام بالانتظار")} value={t.number(queued)} />
        <Stat label={t("مهام فاشلة")} value={t.number(failedCount)} />
        <Stat label={t("مدفوعات معلقة > 30 دقيقة")} value={t.number(stuckPayments)} />
        <Stat label={t("طلبات بانتظار الدفع")} value={t.number(pendingOrders)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t("المهام الفاشلة")} />
          <Table>
            <thead><tr><Th>{t("النوع")}</Th><Th>{t("المحاولات")}</Th><Th>{t("الخطأ")}</Th><Th>{t("آخر محاولة")}</Th><Th></Th></tr></thead>
            <tbody>
              {failed.map((j) => (
                <tr key={j.id}>
                  <Td className="num text-xs">{j.type}</Td>
                  <Td className="num">{j.attempts}</Td>
                  <Td className="max-w-xs truncate text-xs" title={j.lastError ?? ""}>{j.lastError}</Td>
                  <Td><DateText value={j.updatedAt} withTime /></Td>
                  <Td><ActionForm action={retryJobAction} showSuccess={false}><input type="hidden" name="id" value={j.id} /><SubmitButton size="sm" variant="ghost">{t("إعادة")}</SubmitButton></ActionForm></Td>
                </tr>
              ))}
              {failed.length === 0 ? <tr><Td colSpan={5} className="text-center text-ink-muted">{t("لا توجد مهام فاشلة")}</Td></tr> : null}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardHeader title={t("معلومات")} />
          <CardBody className="space-y-2 text-sm">
            <p>{t("البيئة:")}{" "}<Badge tone={env.NODE_ENV === "production" ? "success" : "warning"}>{env.NODE_ENV}</Badge></p>
            <p>{t("العامل الخلفي:")}{" "}<Badge tone={workerHealthy ? "success" : "danger"}>{workerHealthy ? t("يعمل") : t("متوقف؟")}</Badge></p>
            <p>{t("التخزين: {0}", [env.STORAGE_DRIVER])}</p>
            <p className="pt-2 text-xs font-semibold text-ink-muted">{t("آخر الترحيلات")}</p>
            <ul className="num space-y-1 text-xs" dir="ltr">{migrations.map((m) => <li key={m.migration_name}>{m.migration_name} {m.finished_at ? "✓" : "…"}</li>)}</ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
