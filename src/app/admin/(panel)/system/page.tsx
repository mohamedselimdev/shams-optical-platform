import { requireStaffPage } from "@/server/auth/session";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { PageHeader } from "@/components/admin/page-header";
import { ActionForm } from "@/ui/action-form";
import { SubmitButton } from "@/ui/submit-button";
import { Badge, Card, CardBody, CardHeader, DateText, Stat, Table, Td, Th, numberFmt } from "@/ui/primitives";
import { retryJobAction } from "./actions";

export const metadata = { title: "صحة النظام" };

export default async function SystemPage() {
  await requireStaffPage("system.health");
  const started = Date.now();
  await db.$queryRaw`SELECT 1`;
  const dbMs = Date.now() - started;
  const [byStatus, failed, lastSucceeded, stuckPayments, pendingOrders, migrations] = await Promise.all([
    db.job.groupBy({ by: ["status"], _count: true }),
    db.job.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 20 }),
    db.job.findFirst({ where: { status: "SUCCEEDED" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.payment.count({ where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 30 * 60_000) }, provider: { notIn: ["cod", "branch"] } } }),
    db.order.count({ where: { status: "PENDING_PAYMENT" } }),
    db.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5`,
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const workerHealthy = lastSucceeded && Date.now() - lastSucceeded.updatedAt.getTime() < 15 * 60_000;
  const warnings = [
    env.NODE_ENV === "production" && env.PAYMENT_SANDBOX_ENABLED ? "بيئة اختبار الدفع مفعّلة في الإنتاج" : null,
    env.NODE_ENV === "production" && env.STORAGE_DRIVER === "local" ? "التخزين المحلي في الإنتاج لا يصلح لأكثر من خادم" : null,
    env.IP_HASH_SALT === "dev-ip-salt" && env.NODE_ENV === "production" ? "IP_HASH_SALT يستخدم القيمة الافتراضية" : null,
    !workerHealthy ? "لم ينفّذ العامل الخلفي (worker) أي مهمة خلال 15 دقيقة — تأكد من تشغيل npm run worker" : null,
  ].filter(Boolean) as string[];
  return (
    <>
      <PageHeader title="صحة النظام" />
      {warnings.length ? <ul className="mb-6 space-y-1 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm">{warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul> : null}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="قاعدة البيانات" value={`${dbMs} ms`} />
        <Stat label="مهام بالانتظار" value={numberFmt.format(count("PENDING"))} />
        <Stat label="مهام فاشلة" value={numberFmt.format(count("FAILED"))} />
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
