import "server-only";
import { db } from "@/server/db";
import { env } from "@/server/env";

/** Operational health snapshot for the dashboard: DB latency, job queue, worker liveness, config warnings. */
export async function systemHealth() {
  const started = Date.now();
  await db.$queryRaw`SELECT 1`;
  const dbMs = Date.now() - started;
  const [byStatus, failed, lastSucceeded, stuckPayments, pendingOrders, migrations] = await Promise.all([
    db.job.groupBy({ by: ["status"], _count: true }),
    db.job.findMany({ where: { status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 20 }),
    db.job.findFirst({ where: { status: "SUCCEEDED" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    db.payment.count({ where: { status: "PENDING", createdAt: { lt: new Date(Date.now() - 30 * 60_000) }, provider: { notIn: ["cod", "branch", "pos_cash", "pos_card"] } } }),
    db.order.count({ where: { status: "PENDING_PAYMENT" } }),
    db.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 5`,
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count ?? 0;
  const workerHealthy = Boolean(lastSucceeded && Date.now() - lastSucceeded.updatedAt.getTime() < 15 * 60_000);
  const warnings = [
    env.NODE_ENV === "production" && env.PAYMENT_SANDBOX_ENABLED ? "بيئة اختبار الدفع مفعّلة في الإنتاج" : null,
    env.NODE_ENV === "production" && env.STORAGE_DRIVER === "local" ? "التخزين المحلي في الإنتاج لا يصلح لأكثر من خادم" : null,
    env.IP_HASH_SALT === "dev-ip-salt" && env.NODE_ENV === "production" ? "IP_HASH_SALT يستخدم القيمة الافتراضية" : null,
    !workerHealthy ? "لم ينفّذ العامل الخلفي (worker) أي مهمة خلال 15 دقيقة — تأكد من تشغيل npm run worker" : null,
  ].filter((w): w is string => Boolean(w));
  return { dbMs, failed, lastSucceeded, stuckPayments, pendingOrders, migrations, workerHealthy, warnings, queued: count("PENDING"), running: count("RUNNING"), failedCount: count("FAILED"), succeeded: count("SUCCEEDED") };
}
