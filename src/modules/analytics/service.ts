import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

/**
 * First-party, privacy-conscious analytics: no IP addresses, no fingerprinting, a random visitor id
 * cookie set only after consent (when consent is required), and customer linkage only for signed-in
 * shoppers. Raw events are kept for funnel/attribution analysis; aggregates are computed in SQL.
 */
export const ANALYTICS_EVENTS = [
  "page_view",
  "product_view",
  "search",
  "filter",
  "add_to_cart",
  "remove_from_cart",
  "checkout_started",
  "payment_started",
  "purchase",
  "wishlist_add",
  "compare_add",
  "coupon_applied",
  "branch_selected",
  "lens_configured",
] as const;
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[number];

export const collectSchema = z.object({
  name: z.enum(ANALYTICS_EVENTS),
  path: z.string().max(300).optional(),
  referrer: z.string().max(500).optional(),
  productId: z.string().max(40).optional(),
  variantId: z.string().max(40).optional(),
  branchId: z.string().max(40).optional(),
  value: z.number().int().min(0).max(100_000_000).optional(),
  props: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
  utm: z
    .object({ source: z.string().max(100).optional(), medium: z.string().max(100).optional(), campaign: z.string().max(150).optional(), term: z.string().max(100).optional(), content: z.string().max(100).optional() })
    .optional(),
});

export function deviceCategory(ua: string): string {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}

export function isBot(ua: string) {
  return /bot|crawler|spider|crawling|headless|lighthouse|facebookexternalhit|preview/i.test(ua);
}

const SOCIAL = /(facebook|instagram|t\.co|twitter|x\.com|tiktok|snapchat|youtube|linkedin|pinterest|whatsapp)/i;
const SEARCH = /(google\.|bing\.|yahoo\.|duckduckgo|yandex|baidu)/i;

export function attribution(utm: z.infer<typeof collectSchema>["utm"], referrerHost: string | null, ownHost: string) {
  if (utm?.source) return { source: utm.source.toLowerCase(), medium: (utm.medium ?? "(none)").toLowerCase(), campaign: utm.campaign ?? null, term: utm.term ?? null, content: utm.content ?? null };
  if (!referrerHost || referrerHost === ownHost) return { source: "(direct)", medium: "(none)", campaign: null, term: null, content: null };
  if (SEARCH.test(referrerHost)) return { source: referrerHost.replace(/^www\./, ""), medium: "organic", campaign: null, term: null, content: null };
  if (SOCIAL.test(referrerHost)) return { source: referrerHost.replace(/^www\./, ""), medium: "social", campaign: null, term: null, content: null };
  return { source: referrerHost.replace(/^www\./, ""), medium: "referral", campaign: null, term: null, content: null };
}

const SESSION_TIMEOUT_MS = 30 * 60_000;

/** Record an event, creating/refreshing the session. Returns the session id to persist in a cookie. */
export async function recordEvent(opts: {
  visitorId: string;
  sessionId: string | null;
  customerId: string | null;
  userAgent: string;
  ownHost: string;
  event: z.infer<typeof collectSchema>;
}): Promise<string | null> {
  if (isBot(opts.userAgent)) return null;
  const now = new Date();
  let session = opts.sessionId ? await db.analyticsSession.findUnique({ where: { id: opts.sessionId } }) : null;
  if (session && (session.visitorId !== opts.visitorId || now.getTime() - session.lastSeenAt.getTime() > SESSION_TIMEOUT_MS)) session = null;

  if (!session) {
    let referrerHost: string | null = null;
    try {
      referrerHost = opts.event.referrer ? new URL(opts.event.referrer).hostname : null;
    } catch {
      referrerHost = null;
    }
    const attr = attribution(opts.event.utm, referrerHost, opts.ownHost);
    session = await db.analyticsSession.create({
      data: {
        visitorId: opts.visitorId,
        customerId: opts.customerId,
        landingPath: opts.event.path?.slice(0, 300) ?? null,
        referrerHost: referrerHost && referrerHost !== opts.ownHost ? referrerHost : null,
        ...attr,
        deviceCategory: deviceCategory(opts.userAgent),
      },
    });
  }
  await db.analyticsSession.update({
    where: { id: session.id },
    data: { lastSeenAt: now, ...(opts.event.name === "page_view" ? { pageViews: { increment: 1 } } : {}), ...(opts.customerId && !session.customerId ? { customerId: opts.customerId } : {}) },
  });
  await db.analyticsEvent.create({
    data: {
      sessionId: session.id,
      name: opts.event.name,
      path: opts.event.path?.slice(0, 300) ?? null,
      productId: opts.event.productId ?? null,
      variantId: opts.event.variantId ?? null,
      branchId: opts.event.branchId ?? null,
      value: opts.event.value ?? null,
      props: (opts.event.props as Prisma.InputJsonValue) ?? undefined,
    },
  });
  return session.id;
}

export type Range = { from: Date; to: Date };

export async function trafficOverview(range: Range) {
  const [sessions, visitors, pageViews, purchases] = await Promise.all([
    db.analyticsSession.count({ where: { startedAt: { gte: range.from, lte: range.to } } }),
    db.analyticsSession.groupBy({ by: ["visitorId"], where: { startedAt: { gte: range.from, lte: range.to } } }).then((r) => r.length),
    db.analyticsEvent.count({ where: { name: "page_view", createdAt: { gte: range.from, lte: range.to } } }),
    db.analyticsEvent.groupBy({ by: ["sessionId"], where: { name: "purchase", createdAt: { gte: range.from, lte: range.to } } }).then((r) => r.length),
  ]);
  return { sessions, visitors, pageViews, conversionRate: sessions ? purchases / sessions : 0, purchasingSessions: purchases };
}

/** Funnel by distinct sessions reaching each step. */
export async function funnel(range: Range) {
  const steps = ["page_view", "product_view", "add_to_cart", "checkout_started", "payment_started", "purchase"] as const;
  const rows = await db.$queryRaw<{ name: string; sessions: bigint }[]>`
    SELECT "name", COUNT(DISTINCT "sessionId") AS sessions FROM "analytics_event"
     WHERE "createdAt" BETWEEN ${range.from} AND ${range.to} AND "name" = ANY(${steps as unknown as string[]})
     GROUP BY "name"`;
  const map = new Map(rows.map((r) => [r.name, Number(r.sessions)]));
  return steps.map((s) => ({ step: s, sessions: map.get(s) ?? 0 }));
}

export async function trafficSources(range: Range) {
  const rows = await db.$queryRaw<{ source: string; medium: string; sessions: bigint; purchases: bigint; revenue: bigint | null }[]>`
    SELECT s."source", s."medium", COUNT(DISTINCT s."id") AS sessions,
           COUNT(DISTINCT e."sessionId") AS purchases,
           SUM(e."value") AS revenue
      FROM "analytics_session" s
      LEFT JOIN "analytics_event" e ON e."sessionId" = s."id" AND e."name" = 'purchase'
     WHERE s."startedAt" BETWEEN ${range.from} AND ${range.to}
     GROUP BY s."source", s."medium"
     ORDER BY sessions DESC
     LIMIT 20`;
  return rows.map((r) => ({ source: r.source ?? "(direct)", medium: r.medium ?? "(none)", sessions: Number(r.sessions), purchases: Number(r.purchases), revenue: Number(r.revenue ?? 0) }));
}

export async function topViewedProducts(range: Range, take = 10) {
  const rows = await db.$queryRaw<{ productId: string; views: bigint; carts: bigint }[]>`
    SELECT "productId",
           COUNT(*) FILTER (WHERE "name" = 'product_view') AS views,
           COUNT(*) FILTER (WHERE "name" = 'add_to_cart') AS carts
      FROM "analytics_event"
     WHERE "createdAt" BETWEEN ${range.from} AND ${range.to} AND "productId" IS NOT NULL
     GROUP BY "productId" ORDER BY views DESC LIMIT ${take}`;
  const products = await db.product.findMany({ where: { id: { in: rows.map((r) => r.productId) } }, select: { id: true, name: true } });
  const names = new Map(products.map((p) => [p.id, p.name]));
  return rows.map((r) => ({ productId: r.productId, name: names.get(r.productId) ?? "—", views: Number(r.views), addToCart: Number(r.carts) }));
}

export async function deviceBreakdown(range: Range) {
  const rows = await db.analyticsSession.groupBy({ by: ["deviceCategory"], where: { startedAt: { gte: range.from, lte: range.to } }, _count: true });
  return rows.map((r) => ({ device: r.deviceCategory ?? "unknown", sessions: r._count }));
}

export async function topSearches(range: Range) {
  const rows = await db.$queryRaw<{ term: string; count: bigint }[]>`
    SELECT lower("props"->>'q') AS term, COUNT(*) AS count FROM "analytics_event"
     WHERE "name" = 'search' AND "createdAt" BETWEEN ${range.from} AND ${range.to} AND "props"->>'q' IS NOT NULL
     GROUP BY term ORDER BY count DESC LIMIT 15`;
  return rows.map((r) => ({ term: r.term, count: Number(r.count) }));
}

export async function branchSelections(range: Range) {
  const rows = await db.analyticsEvent.groupBy({ by: ["branchId"], where: { name: "branch_selected", createdAt: { gte: range.from, lte: range.to }, branchId: { not: null } }, _count: true });
  const branches = await db.branch.findMany({ where: { id: { in: rows.map((r) => r.branchId!) } }, select: { id: true, name: true } });
  const names = new Map(branches.map((b) => [b.id, b.name]));
  return rows.map((r) => ({ branch: names.get(r.branchId!) ?? "—", count: r._count }));
}

/** Mark carts idle beyond the threshold as abandoned (recovery messaging is queued separately). */
export async function markAbandonedCarts(idleMinutes: number) {
  const cutoff = new Date(Date.now() - idleMinutes * 60_000);
  const res = await db.cart.updateMany({
    where: { status: "ACTIVE", abandonedAt: null, lastActivityAt: { lt: cutoff }, items: { some: {} } },
    data: { abandonedAt: new Date() },
  });
  return res.count;
}

export async function abandonedCartStats(range: Range) {
  const [abandoned, recovered, withEmail] = await Promise.all([
    db.cart.count({ where: { abandonedAt: { gte: range.from, lte: range.to } } }),
    db.cart.count({ where: { abandonedAt: { gte: range.from, lte: range.to }, status: "CONVERTED" } }),
    db.cart.count({ where: { abandonedAt: { gte: range.from, lte: range.to }, OR: [{ email: { not: null } }, { customerId: { not: null } }] } }),
  ]);
  return { abandoned, recovered, contactable: withEmail };
}
