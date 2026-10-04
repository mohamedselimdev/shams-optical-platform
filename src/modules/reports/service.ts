import "server-only";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { type StaffActor, assertCan } from "@/server/rbac/actor";
import { forbidden } from "@/server/errors";

/**
 * Reporting. "Net sales" = order totals minus refunds for orders that are not cancelled and not
 * awaiting payment. Margin = line revenue excluding VAT minus snapshotted unit cost. Every query is
 * branch-scoped to the actor's branches.
 */
export type ReportRange = { from: Date; to: Date; branchId?: string | null };

function branchFilter(actor: StaffActor, branchId: string | null | undefined, column = Prisma.sql`o."fulfillmentBranchId"`) {
  if (branchId) {
    if (actor.branchIds !== "ALL" && !actor.branchIds.includes(branchId)) throw forbidden();
    return Prisma.sql`AND ${column} = ${branchId}`;
  }
  if (actor.branchIds === "ALL") return Prisma.empty;
  if (actor.branchIds.length === 0) return Prisma.sql`AND FALSE`;
  return Prisma.sql`AND ${column} IN (${Prisma.join([...actor.branchIds])})`;
}

const SOLD = Prisma.sql`o."status" NOT IN ('CANCELLED', 'PENDING_PAYMENT')`;
const n = (v: bigint | number | null | undefined) => Number(v ?? 0);

export async function dashboardKpis(actor: StaffActor, r: ReportRange) {
  assertCan(actor, "dashboard.view");
  const bf = branchFilter(actor, r.branchId);
  const [sales] = await db.$queryRaw<{ orders: bigint; gross: bigint; refunded: bigint; discounts: bigint; customers: bigint }[]>`
    SELECT COUNT(*) AS orders, COALESCE(SUM(o."total"),0) AS gross, COALESCE(SUM(o."refundedTotal"),0) AS refunded,
           COALESCE(SUM(o."discountTotal" + o."loyaltyDiscount"),0) AS discounts, COUNT(DISTINCT o."customerId") AS customers
      FROM "order" o WHERE ${SOLD} AND o."placedAt" BETWEEN ${r.from} AND ${r.to} ${bf}`;
  const [margin] = await db.$queryRaw<{ revenue: bigint; cost: bigint }[]>`
    SELECT COALESCE(SUM(i."lineTotal" - i."taxTotal"),0) AS revenue, COALESCE(SUM(i."unitCost" * i."quantity"),0) AS cost
      FROM "order_item" i JOIN "order" o ON o."id" = i."orderId"
     WHERE ${SOLD} AND o."placedAt" BETWEEN ${r.from} AND ${r.to} ${bf}`;
  const [returns] = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count FROM "return_request" rr JOIN "order" o ON o."id" = rr."orderId"
     WHERE rr."createdAt" BETWEEN ${r.from} AND ${r.to} ${bf}`;
  const newCustomers = await db.customer.count({ where: { createdAt: { gte: r.from, lte: r.to } } });
  const [carts, checkouts] = await Promise.all([
    db.cart.count({ where: { createdAt: { gte: r.from, lte: r.to }, items: { some: {} } } }),
    db.analyticsEvent.groupBy({ by: ["sessionId"], where: { name: "checkout_started", createdAt: { gte: r.from, lte: r.to } } }).then((x) => x.length),
  ]);
  const orders = n(sales.orders);
  const net = n(sales.gross) - n(sales.refunded);
  const revenueExVat = n(margin.revenue);
  return {
    orders,
    netSales: net,
    refunds: n(sales.refunded),
    discounts: n(sales.discounts),
    aov: orders ? Math.round(n(sales.gross) / orders) : 0,
    grossMargin: revenueExVat - n(margin.cost),
    marginRate: revenueExVat ? (revenueExVat - n(margin.cost)) / revenueExVat : 0,
    returns: n(returns.count),
    buyingCustomers: n(sales.customers),
    newCustomers,
    carts,
    checkouts,
  };
}

export async function salesByDay(actor: StaffActor, r: ReportRange) {
  assertCan(actor, "reports.read");
  const rows = await db.$queryRaw<{ day: Date; orders: bigint; net: bigint }[]>`
    SELECT date_trunc('day', o."placedAt" AT TIME ZONE 'Africa/Cairo') AS day, COUNT(*) AS orders, SUM(o."total" - o."refundedTotal") AS net
      FROM "order" o WHERE ${SOLD} AND o."placedAt" BETWEEN ${r.from} AND ${r.to} ${branchFilter(actor, r.branchId)}
     GROUP BY day ORDER BY day`;
  return rows.map((x) => ({ day: x.day.toISOString().slice(0, 10), orders: n(x.orders), net: n(x.net) }));
}

export async function salesByBranch(actor: StaffActor, r: ReportRange) {
  assertCan(actor, "reports.read");
  const rows = await db.$queryRaw<{ branch: string; orders: bigint; net: bigint }[]>`
    SELECT b."name" AS branch, COUNT(*) AS orders, SUM(o."total" - o."refundedTotal") AS net
      FROM "order" o JOIN "branch" b ON b."id" = o."fulfillmentBranchId"
     WHERE ${SOLD} AND o."placedAt" BETWEEN ${r.from} AND ${r.to} ${branchFilter(actor, r.branchId)}
     GROUP BY b."name" ORDER BY net DESC`;
  return rows.map((x) => ({ branch: x.branch, orders: n(x.orders), net: n(x.net) }));
}

type Dim = "product" | "brand" | "category";
export async function salesByDimension(actor: StaffActor, r: ReportRange, dim: Dim, take = 20) {
  assertCan(actor, "reports.read");
  const key = dim === "product" ? Prisma.sql`i."productName"` : dim === "brand" ? Prisma.sql`COALESCE(i."brandName", '—')` : Prisma.sql`COALESCE(c."name", '—')`;
  const rows = await db.$queryRaw<{ label: string; units: bigint; revenue: bigint; cost: bigint; discount: bigint }[]>`
    SELECT ${key} AS label, SUM(i."quantity") AS units, SUM(i."lineTotal" - i."taxTotal") AS revenue,
           SUM(i."unitCost" * i."quantity") AS cost, SUM(i."discountTotal") AS discount
      FROM "order_item" i JOIN "order" o ON o."id" = i."orderId"
      LEFT JOIN "category" c ON c."id" = i."categoryId"
     WHERE ${SOLD} AND o."placedAt" BETWEEN ${r.from} AND ${r.to} ${branchFilter(actor, r.branchId)}
     GROUP BY label ORDER BY revenue DESC LIMIT ${take}`;
  return rows.map((x) => ({ label: x.label, units: n(x.units), revenue: n(x.revenue), cost: n(x.cost), margin: n(x.revenue) - n(x.cost), discount: n(x.discount) }));
}

export async function paymentPerformance(actor: StaffActor, r: ReportRange) {
  assertCan(actor, "reports.read");
  const rows = await db.$queryRaw<{ provider: string; method: string; attempts: bigint; succeeded: bigint; amount: bigint; refunded: bigint }[]>`
    SELECT p."provider", p."method"::text AS method, COUNT(*) AS attempts,
           COUNT(*) FILTER (WHERE p."status" = 'SUCCEEDED') AS succeeded,
           COALESCE(SUM(p."amount") FILTER (WHERE p."status" = 'SUCCEEDED'),0) AS amount,
           COALESCE(SUM(p."refundedAmount"),0) AS refunded
      FROM "payment" p JOIN "order" o ON o."id" = p."orderId"
     WHERE p."createdAt" BETWEEN ${r.from} AND ${r.to} ${branchFilter(actor, r.branchId)}
     GROUP BY p."provider", p."method" ORDER BY amount DESC`;
  return rows.map((x) => ({ provider: x.provider, method: x.method, attempts: n(x.attempts), succeeded: n(x.succeeded), successRate: n(x.attempts) ? n(x.succeeded) / n(x.attempts) : 0, amount: n(x.amount), refunded: n(x.refunded) }));
}

export async function inventoryValuation(actor: StaffActor, branchId?: string | null) {
  assertCan(actor, "inventory.read");
  const bf = branchFilter(actor, branchId, Prisma.sql`ii."branchId"`);
  const rows = await db.$queryRaw<{ branch: string; units: bigint; cost: bigint; retail: bigint }[]>`
    SELECT b."name" AS branch, SUM(ii."onHand") AS units, SUM(ii."onHand" * v."costPrice") AS cost,
           SUM(ii."onHand" * COALESCE(v."salePrice", v."price")) AS retail
      FROM "inventory_item" ii JOIN "product_variant" v ON v."id" = ii."variantId" JOIN "branch" b ON b."id" = ii."branchId"
     WHERE TRUE ${bf} GROUP BY b."name" ORDER BY cost DESC`;
  return rows.map((x) => ({ branch: x.branch, units: n(x.units), cost: n(x.cost), retail: n(x.retail) }));
}

export async function lowStock(actor: StaffActor, branchId?: string | null, take = 50) {
  assertCan(actor, "inventory.read");
  const bf = branchFilter(actor, branchId, Prisma.sql`ii."branchId"`);
  const rows = await db.$queryRaw<{ sku: string; product: string; branch: string; onHand: number; reserved: number; reorderPoint: number }[]>`
    SELECT v."sku", p."name" AS product, b."name" AS branch, ii."onHand", ii."reserved", ii."reorderPoint"
      FROM "inventory_item" ii JOIN "product_variant" v ON v."id" = ii."variantId" JOIN "product" p ON p."id" = v."productId" JOIN "branch" b ON b."id" = ii."branchId"
     WHERE v."isActive" AND p."status" = 'ACTIVE' AND (ii."onHand" - ii."reserved") <= GREATEST(ii."reorderPoint", 1) ${bf}
     ORDER BY (ii."onHand" - ii."reserved") ASC, v."sku" LIMIT ${take}`;
  return rows;
}

/** Variants with stock but no sale movement in `days` days. */
export async function deadStock(actor: StaffActor, days = 90, branchId?: string | null) {
  assertCan(actor, "inventory.read");
  const since = new Date(Date.now() - days * 86_400_000);
  const bf = branchFilter(actor, branchId, Prisma.sql`ii."branchId"`);
  return db.$queryRaw<{ sku: string; product: string; branch: string; onHand: number; value: bigint }[]>`
    SELECT v."sku", p."name" AS product, b."name" AS branch, ii."onHand", (ii."onHand" * v."costPrice")::bigint AS value
      FROM "inventory_item" ii JOIN "product_variant" v ON v."id" = ii."variantId" JOIN "product" p ON p."id" = v."productId" JOIN "branch" b ON b."id" = ii."branchId"
     WHERE ii."onHand" > 0 ${bf}
       AND NOT EXISTS (SELECT 1 FROM "inventory_movement" m WHERE m."variantId" = ii."variantId" AND m."branchId" = ii."branchId" AND m."type" = 'SALE' AND m."createdAt" >= ${since})
     ORDER BY value DESC LIMIT 100`;
}

export async function purchasingBySupplier(actor: StaffActor, r: ReportRange) {
  assertCan(actor, "purchasing.read");
  const rows = await db.$queryRaw<{ supplier: string; orders: bigint; ordered: bigint; received: bigint }[]>`
    SELECT s."name" AS supplier, COUNT(DISTINCT po."id") AS orders,
           SUM(pi."quantityOrdered" * pi."unitCost") AS ordered, SUM(pi."quantityReceived" * pi."unitCost") AS received
      FROM "purchase_order" po JOIN "supplier" s ON s."id" = po."supplierId" JOIN "purchase_order_item" pi ON pi."purchaseOrderId" = po."id"
     WHERE po."createdAt" BETWEEN ${r.from} AND ${r.to} AND po."status" <> 'CANCELLED' ${branchFilter(actor, r.branchId, Prisma.sql`po."branchId"`)}
     GROUP BY s."name" ORDER BY ordered DESC`;
  return rows.map((x) => ({ supplier: x.supplier, orders: n(x.orders), ordered: n(x.ordered), received: n(x.received) }));
}

export async function returnsReport(actor: StaffActor, r: ReportRange) {
  assertCan(actor, "returns.read");
  const rows = await db.$queryRaw<{ reason: string; count: bigint; refunded: bigint }[]>`
    SELECT rr."reason", COUNT(*) AS count, COALESCE(SUM(rr."refundAmount"),0) AS refunded
      FROM "return_request" rr JOIN "order" o ON o."id" = rr."orderId"
     WHERE rr."createdAt" BETWEEN ${r.from} AND ${r.to} ${branchFilter(actor, r.branchId)}
     GROUP BY rr."reason" ORDER BY count DESC LIMIT 30`;
  return rows.map((x) => ({ reason: x.reason, count: n(x.count), refunded: n(x.refunded) }));
}

export async function discountsReport(actor: StaffActor, r: ReportRange) {
  assertCan(actor, "reports.read");
  const rows = await db.$queryRaw<{ name: string; code: string | null; uses: bigint; amount: bigint }[]>`
    SELECT p."name", p."code", COUNT(*) AS uses, SUM(pr."amount") AS amount
      FROM "promotion_redemption" pr JOIN "promotion" p ON p."id" = pr."promotionId" JOIN "order" o ON o."id" = pr."orderId"
     WHERE pr."reversedAt" IS NULL AND pr."createdAt" BETWEEN ${r.from} AND ${r.to} ${branchFilter(actor, r.branchId)}
     GROUP BY p."name", p."code" ORDER BY amount DESC`;
  return rows.map((x) => ({ name: x.name, code: x.code, uses: n(x.uses), amount: n(x.amount) }));
}

export async function topCustomers(actor: StaffActor, r: ReportRange) {
  assertCan(actor, "customers.read");
  const rows = await db.$queryRaw<{ id: string; name: string; orders: bigint; net: bigint }[]>`
    SELECT c."id", c."firstName" || COALESCE(' ' || c."lastName", '') AS name, COUNT(*) AS orders, SUM(o."total" - o."refundedTotal") AS net
      FROM "order" o JOIN "customer" c ON c."id" = o."customerId"
     WHERE ${SOLD} AND o."placedAt" BETWEEN ${r.from} AND ${r.to} ${branchFilter(actor, r.branchId)}
     GROUP BY c."id", name ORDER BY net DESC LIMIT 25`;
  return rows.map((x) => ({ id: x.id, name: x.name, orders: n(x.orders), net: n(x.net) }));
}

export async function loyaltyLiability(actor: StaffActor) {
  assertCan(actor, "loyalty.read");
  const agg = await db.loyaltyAccount.aggregate({ _sum: { balance: true, lifetimeEarned: true }, _count: true });
  return { accounts: agg._count, outstandingPoints: agg._sum.balance ?? 0, lifetimeEarned: agg._sum.lifetimeEarned ?? 0 };
}

export async function marketingAttribution(actor: StaffActor, r: ReportRange) {
  assertCan(actor, "analytics.read");
  const rows = await db.$queryRaw<{ source: string; medium: string; campaign: string | null; orders: bigint; net: bigint }[]>`
    SELECT COALESCE(s."source", '(direct)') AS source, COALESCE(s."medium", '(none)') AS medium, s."campaign",
           COUNT(o."id") AS orders, SUM(o."total" - o."refundedTotal") AS net
      FROM "order" o LEFT JOIN "analytics_session" s ON s."id" = o."analyticsSessionId"
     WHERE ${SOLD} AND o."placedAt" BETWEEN ${r.from} AND ${r.to} ${branchFilter(actor, r.branchId)}
     GROUP BY 1, 2, 3 ORDER BY net DESC LIMIT 30`;
  return rows.map((x) => ({ source: x.source, medium: x.medium, campaign: x.campaign, orders: n(x.orders), net: n(x.net) }));
}

export async function stockMovementsReport(actor: StaffActor, r: ReportRange) {
  assertCan(actor, "inventory.read");
  const rows = await db.$queryRaw<{ type: string; movements: bigint; units: bigint }[]>`
    SELECT m."type"::text AS type, COUNT(*) AS movements, SUM(m."quantity") AS units
      FROM "inventory_movement" m
     WHERE m."createdAt" BETWEEN ${r.from} AND ${r.to} ${branchFilter(actor, r.branchId, Prisma.sql`m."branchId"`)}
     GROUP BY m."type" ORDER BY movements DESC`;
  return rows.map((x) => ({ type: x.type, movements: n(x.movements), units: n(x.units) }));
}
