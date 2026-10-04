import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type DbOrTx } from "../db";
import { logger } from "../logger";

/**
 * Durable PostgreSQL job queue (outbox pattern). Jobs enqueued inside a business transaction
 * only become visible if that transaction commits. Workers claim with FOR UPDATE SKIP LOCKED,
 * so multiple worker processes are safe. Redis is not required.
 */
export type JobType =
  | "notify.order_status"
  | "orders.expire_pending"
  | "payments.reconcile"
  | "payments.refund_orphan"
  | "carts.mark_abandoned"
  | "carts.recovery_email"
  | "analytics.ga4_forward";

export async function enqueue(
  client: DbOrTx,
  type: JobType,
  payload: Record<string, unknown>,
  opts: { runAt?: Date; dedupeKey?: string; maxAttempts?: number } = {},
) {
  if (opts.dedupeKey) {
    const existing = await client.job.findUnique({ where: { dedupeKey: opts.dedupeKey } });
    if (existing) return existing;
  }
  return client.job.create({
    data: { type, payload: payload as Prisma.InputJsonValue, runAt: opts.runAt ?? new Date(), dedupeKey: opts.dedupeKey ?? null, maxAttempts: opts.maxAttempts ?? 5 },
  });
}

export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

/** Claim and run up to `limit` due jobs. Returns the number processed. */
export async function runDueJobs(handlers: Partial<Record<JobType, JobHandler>>, limit = 20): Promise<number> {
  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE "job" SET "status" = 'RUNNING', "lockedAt" = now(), "attempts" = "attempts" + 1, "updatedAt" = now()
     WHERE "id" IN (
       SELECT "id" FROM "job"
        WHERE ("status" = 'PENDING' AND "runAt" <= now())
           OR ("status" = 'RUNNING' AND "lockedAt" < now() - interval '10 minutes')
        ORDER BY "runAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)
     RETURNING "id"`;
  for (const { id } of claimed) {
    const job = await db.job.findUnique({ where: { id } });
    if (!job) continue;
    const handler = handlers[job.type as JobType];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(job.payload as Record<string, unknown>);
      await db.job.update({ where: { id }, data: { status: "SUCCEEDED", lockedAt: null, lastError: null } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const exhausted = job.attempts >= job.maxAttempts;
      // Exponential backoff: 30s, 2m, 8m, 32m…
      const delay = 30_000 * 4 ** Math.max(0, job.attempts - 1);
      await db.job.update({
        where: { id },
        data: { status: exhausted ? "FAILED" : "PENDING", lockedAt: null, lastError: message.slice(0, 1000), runAt: new Date(Date.now() + delay) },
      });
      logger.warn({ jobId: id, type: job.type, attempts: job.attempts, exhausted, err: message }, "job failed");
    }
  }
  return claimed.length;
}
