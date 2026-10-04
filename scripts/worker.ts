/**
 * Background worker: runs due jobs from the PostgreSQL queue and enqueues periodic maintenance.
 * Run one or more instances (`npm run worker`); FOR UPDATE SKIP LOCKED makes concurrent workers safe,
 * and per-slot dedupe keys stop scheduled jobs being enqueued twice.
 */
import "dotenv/config";
import { db } from "@/server/db";
import { enqueue, runDueJobs } from "@/server/jobs/queue";
import { jobHandlers, SCHEDULE } from "@/modules/notifications/handlers";
import { logger } from "@/server/logger";

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    stopping = true;
    logger.info({ sig }, "worker stopping");
  });
}

async function schedule() {
  const now = Date.now();
  for (const s of SCHEDULE) {
    const slot = Math.floor(now / (s.everyMinutes * 60_000));
    await enqueue(db, s.type, {}, { dedupeKey: `${s.type}:${slot}`, maxAttempts: 1 });
  }
}

async function main() {
  logger.info("worker started");
  while (!stopping) {
    try {
      await schedule();
      const n = await runDueJobs(jobHandlers, 20);
      if (n === 0) await new Promise((r) => setTimeout(r, 5_000));
    } catch (err) {
      logger.error({ err }, "worker loop error");
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
  await db.$disconnect();
}

void main();
