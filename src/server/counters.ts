import "server-only";
import type { Tx } from "./db";

/**
 * Gap-tolerant, concurrency-safe document numbering (orders, POs, transfers, returns).
 * The UPSERT takes a row lock so concurrent callers receive distinct values.
 */
export async function nextNumber(tx: Tx, key: string, prefix: string, pad = 6): Promise<string> {
  const year = new Date().getUTCFullYear();
  const counterKey = `${key}:${year}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "counter" ("key", "value") VALUES (${counterKey}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "counter"."value" + 1
    RETURNING "value"`;
  return `${prefix}-${year}-${String(rows[0].value).padStart(pad, "0")}`;
}
