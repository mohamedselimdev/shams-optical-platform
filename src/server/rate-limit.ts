import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "./db";
import { env } from "./env";
import { DomainError } from "./errors";

/**
 * Fixed-window rate limiter backed by PostgreSQL (shared across instances, no extra infra).
 * Keys are hashed so raw IPs/emails are never stored.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<{ ok: boolean; remaining: number }> {
  const hashed = `app:${createHash("sha256").update(key).digest("hex").slice(0, 40)}`;
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "rate_limit" ("id", "key", "count", "lastRequest")
    VALUES (${crypto.randomUUID()}, ${hashed}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limit"."lastRequest" < ${windowStart} THEN 1 ELSE "rate_limit"."count" + 1 END,
      "lastRequest" = CASE WHEN "rate_limit"."lastRequest" < ${windowStart} THEN ${now} ELSE "rate_limit"."lastRequest" END
    RETURNING "count"`;
  const count = Number(rows[0]?.count ?? 1);
  return { ok: count <= max, remaining: Math.max(0, max - count) };
}

export async function enforceRateLimit(key: string, max: number, windowSeconds: number) {
  const result = await rateLimit(key, max, windowSeconds);
  if (!result.ok) {
    throw new DomainError("RATE_LIMITED", "محاولات كثيرة جداً، يرجى المحاولة لاحقاً");
  }
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${env.IP_HASH_SALT}:${ip}`).digest("hex").slice(0, 32);
}
