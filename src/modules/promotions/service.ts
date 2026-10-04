import "server-only";
import { z } from "zod";
import { db, type DbOrTx, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, assertCan } from "@/server/rbac/actor";
import { conflict, invalid, notFound } from "@/server/errors";
import { zCheckbox, zOptionalEgp, zOptionalInt, zText } from "@/lib/validation";
import type { PromotionRule } from "../pricing/engine";

/**
 * Load promotions the customer may use right now (dates, activity, global & per-customer usage,
 * eligibility). Coupon matching and stacking are decided by the pricing engine.
 */
export async function eligiblePromotions(client: DbOrTx, opts: { customerId: string | null; couponCode: string | null; now?: Date }): Promise<PromotionRule[]> {
  const now = opts.now ?? new Date();
  const code = opts.couponCode?.trim().toUpperCase() || null;
  const promos = await client.promotion.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        { OR: [{ kind: "AUTOMATIC" }, ...(code ? [{ kind: "COUPON" as const, code: { equals: code, mode: "insensitive" as const } }] : [])] },
      ],
    },
    include: { customers: opts.customerId ? { where: { customerId: opts.customerId } } : false },
  });

  let hasPriorOrders: boolean | null = null;
  const result: PromotionRule[] = [];
  for (const p of promos) {
    if (p.usageLimit !== null && p.usedCount >= p.usageLimit) continue;
    if (p.eligibility !== "ALL" && !opts.customerId) continue;
    if (p.eligibility === "SPECIFIC" && !(p.customers && p.customers.length > 0)) continue;
    if (p.eligibility === "NEW_CUSTOMERS") {
      hasPriorOrders ??= (await client.order.count({ where: { customerId: opts.customerId!, status: { notIn: ["CANCELLED"] } } })) > 0;
      if (hasPriorOrders) continue;
    }
    if (p.usagePerCustomer !== null) {
      if (!opts.customerId) continue;
      const used = await client.promotionRedemption.count({ where: { promotionId: p.id, customerId: opts.customerId, reversedAt: null } });
      if (used >= p.usagePerCustomer) continue;
    }
    result.push({
      id: p.id,
      name: p.name,
      kind: p.kind,
      code: p.code,
      discountType: p.discountType,
      value: p.value,
      maxDiscount: p.maxDiscount,
      minSubtotal: p.minSubtotal,
      scope: p.scope,
      targetIds: p.targetIds,
      excludeSaleItems: p.excludeSaleItems,
      includeLenses: p.includeLenses,
      stackable: p.stackable,
      priority: p.priority,
    });
  }
  return result;
}

/** Record redemptions atomically; the conditional UPDATE enforces the global usage limit under concurrency. */
export async function redeemPromotions(tx: Tx, orderId: string, customerId: string | null, applied: { id: string; amount: number }[]) {
  for (const a of applied) {
    const updated = await tx.$executeRaw`
      UPDATE "promotion" SET "usedCount" = "usedCount" + 1
       WHERE "id" = ${a.id} AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
    if (updated !== 1) throw conflict("انتهى عدد مرات استخدام العرض أو الكوبون");
    await tx.promotionRedemption.create({ data: { promotionId: a.id, orderId, customerId, amount: a.amount } });
  }
}

export async function reverseRedemptions(tx: Tx, orderId: string) {
  const redemptions = await tx.promotionRedemption.findMany({ where: { orderId, reversedAt: null } });
  for (const r of redemptions) {
    await tx.promotionRedemption.update({ where: { id: r.id }, data: { reversedAt: new Date() } });
    await tx.$executeRaw`UPDATE "promotion" SET "usedCount" = GREATEST("usedCount" - 1, 0) WHERE "id" = ${r.promotionId}`;
  }
}

export const promotionSchema = z
  .object({
    name: zText(120),
    description: z.string().trim().max(500).optional().transform((v) => v || null),
    kind: z.enum(["COUPON", "AUTOMATIC"]),
    code: z.string().trim().toUpperCase().max(30).optional().transform((v) => v || null),
    discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_SHIPPING"]),
    /** Percent for PERCENTAGE (e.g. "15"), EGP for FIXED_AMOUNT. Converted below. */
    value: z.string().trim().default("0"),
    maxDiscount: zOptionalEgp,
    minSubtotal: zOptionalEgp,
    scope: z.enum(["ORDER", "PRODUCTS", "CATEGORIES", "BRANDS", "COLLECTIONS"]),
    targetIds: z.array(z.string()).default([]),
    eligibility: z.enum(["ALL", "NEW_CUSTOMERS", "SPECIFIC"]),
    excludeSaleItems: zCheckbox,
    includeLenses: zCheckbox,
    stackable: zCheckbox,
    priority: z.coerce.number().int().min(0).max(1000).default(0),
    usageLimit: zOptionalInt(1, 10_000_000),
    usagePerCustomer: zOptionalInt(1, 1000),
    startsAt: z.union([z.literal(""), z.coerce.date()]).optional().transform((v) => (v ? v : null)),
    endsAt: z.union([z.literal(""), z.coerce.date()]).optional().transform((v) => (v ? v : null)),
    isActive: zCheckbox,
  })
  .superRefine((v, ctx) => {
    if (v.kind === "COUPON" && !v.code) ctx.addIssue({ code: "custom", path: ["code"], message: "كود الكوبون مطلوب" });
    if (v.code && !/^[A-Z0-9_-]{3,30}$/.test(v.code)) ctx.addIssue({ code: "custom", path: ["code"], message: "الكود أحرف إنجليزية وأرقام فقط" });
    if (v.scope !== "ORDER" && v.targetIds.length === 0) ctx.addIssue({ code: "custom", path: ["targetIds"], message: "اختر العناصر المستهدفة" });
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "تاريخ الانتهاء قبل البداية" });
  });

function toStoredValue(discountType: string, raw: string): number {
  if (discountType === "FREE_SHIPPING") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw invalid("قيمة الخصم غير صالحة");
  if (discountType === "PERCENTAGE") {
    if (n > 100) throw invalid("النسبة لا تتجاوز 100%");
    return Math.round(n * 100);
  }
  return Math.round(n * 100);
}

export async function savePromotion(actor: Actor, id: string | null, input: unknown) {
  assertCan(actor, "promotions.write");
  const data = promotionSchema.parse(input);
  const value = toStoredValue(data.discountType, data.value);
  const payload = { ...data, value, code: data.kind === "COUPON" ? data.code : null, minSubtotal: data.minSubtotal ?? 0 };
  return db.$transaction(async (tx) => {
    if (payload.code) {
      const dup = await tx.promotion.findFirst({ where: { code: { equals: payload.code, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) } });
      if (dup) throw conflict("الكود مستخدم بالفعل");
    }
    if (id) {
      const before = await tx.promotion.findUnique({ where: { id } });
      if (!before) throw notFound("العرض");
      const after = await tx.promotion.update({ where: { id }, data: payload });
      await audit(tx, actor, { action: "promotion.update", entityType: "promotion", entityId: id, before, after });
      return after;
    }
    const created = await tx.promotion.create({ data: payload });
    await audit(tx, actor, { action: "promotion.create", entityType: "promotion", entityId: created.id, after: created });
    return created;
  });
}
