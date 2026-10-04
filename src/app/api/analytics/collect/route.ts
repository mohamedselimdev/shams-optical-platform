import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { collectSchema, recordEvent } from "@/modules/analytics/service";
import { getCustomerActor } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { env } from "@/server/env";
import { rateLimit, hashIp } from "@/server/rate-limit";
import { logger } from "@/server/logger";

const VISITOR = "shams_vid";
const SESSION = "shams_sid";

/** First-party event collection. Honors the consent setting, rate-limits per IP hash, never stores IPs. */
export async function POST(req: NextRequest) {
  const settings = await getSetting("analytics");
  if (!settings.enabled) return new NextResponse(null, { status: 204 });
  if (settings.requireConsent && req.cookies.get("shams_consent")?.value !== "granted") return new NextResponse(null, { status: 204 });
  if (Number(req.headers.get("content-length") ?? 0) > 4096) return new NextResponse(null, { status: 413 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limit = await rateLimit(`collect:${hashIp(ip)}`, 120, 60);
  if (!limit.ok) return new NextResponse(null, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = collectSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });

  const visitorId = req.cookies.get(VISITOR)?.value ?? randomUUID();
  const actor = await getCustomerActor();
  try {
    const sessionId = await recordEvent({
      visitorId,
      sessionId: req.cookies.get(SESSION)?.value ?? null,
      customerId: actor?.customerId ?? null,
      userAgent: req.headers.get("user-agent") ?? "",
      ownHost: new URL(env.APP_URL).hostname,
      event: parsed.data,
    });
    const res = new NextResponse(null, { status: 204 });
    const secure = env.NODE_ENV === "production";
    res.cookies.set(VISITOR, visitorId, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 60 * 24 * 365 });
    if (sessionId) res.cookies.set(SESSION, sessionId, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 60 * 30 });
    return res;
  } catch (err) {
    logger.warn({ err }, "analytics collect failed");
    return new NextResponse(null, { status: 204 });
  }
}
