import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { nextNumber } from "@/server/counters";
import { logger } from "@/server/logger";
import { assertCan, type StaffActor } from "@/server/rbac/actor";
import { DomainError, invalid } from "@/server/errors";
import { zEgyptPhone, zOptionalEgp } from "@/lib/validation";
import { formatMoney } from "@/lib/money";
import { newCartToken, cartItemInclude } from "../cart/service";
import { buildQuote } from "../checkout/quote";
import { buildOrderData, couponMessage } from "../checkout/service";
import { reserveStock } from "../inventory/ledger";
import { redeemPromotions } from "../promotions/service";
import { OFFLINE_PROVIDER } from "../payments/registry";
import { ORDER_REF, applyTransition, lockOrder } from "../orders/service";

/**
 * In-store sale on the same order core as web checkout: the same quote engine prices the basket
 * (promotions, coupons, tax), the same ledger reserves and then deducts stock (as a SALE movement
 * at the selling branch), and the same transition records payment, loyalty and the timeline.
 * POS v1 sells frames and accessories; lens jobs are entered as web/admin orders.
 */
export const posSaleSchema = z
  .object({
    idempotencyKey: z.string().min(16).max(80),
    branchId: z.string().min(1, "اختر الفرع"),
    items: z
      .array(z.object({ variantId: z.string().min(1), quantity: z.coerce.number().int("كمية غير صالحة").min(1, "الكمية يجب أن تكون 1 على الأقل").max(50, "الحد الأقصى 50") }))
      .min(1, "أضف بنداً واحداً على الأقل")
      .max(40),
    customerPhone: z.union([z.literal(""), zEgyptPhone]).optional().transform((v) => v || null),
    customerName: z.string().trim().max(120).optional().transform((v) => v || null),
    couponCode: z.string().trim().max(30).optional().transform((v) => v || null),
    paymentMethod: z.enum(["CASH", "CARD_PRESENT"]),
    cashTendered: zOptionalEgp,
    // Terminal slip / approval reference only. Never a card number (PCI): long digit runs are rejected.
    cardReference: z
      .string()
      .trim()
      .max(40)
      .refine((v) => !/\d{12,}/.test(v.replace(/[\s-]/g, "")), "لا تُدخل رقم البطاقة؛ أدخل رقم إيصال الماكينة فقط")
      .optional()
      .transform((v) => v || null),
    note: z.string().trim().max(500).optional().transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.customerName && !v.customerPhone) ctx.addIssue({ code: "custom", path: ["customerPhone"], message: "أدخل رقم موبايل العميل" });
  });

export type PosSaleInput = z.input<typeof posSaleSchema>;
export type PosSaleResult = { orderId: string; number: string; total: number; change: number; duplicate: boolean };

export async function placePosSale(actor: StaffActor, input: PosSaleInput): Promise<PosSaleResult> {
  const data = posSaleSchema.parse(input);
  assertCan(actor, "pos.use", data.branchId);
  assertCan(actor, "orders.create", data.branchId);

  const existing = await db.order.findUnique({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true, number: true, total: true, channel: true } });
  if (existing) {
    if (existing.channel !== "POS") throw invalid("مفتاح العملية مستخدم مسبقاً");
    return { orderId: existing.id, number: existing.number, total: existing.total, change: 0, duplicate: true };
  }

  try {
    return await db.$transaction(
      async (tx) => {
        const branch = await tx.branch.findFirst({ where: { id: data.branchId, isActive: true }, select: { id: true, name: true } });
        if (!branch) throw invalid("الفرع غير متاح");

        const customer = await resolveCustomer(tx, data.customerPhone, data.customerName);
        if (customer) await tx.$queryRaw`SELECT "id" FROM "customer" WHERE "id" = ${customer.id} FOR UPDATE`;

        // A transient cart lets POS reuse the web quote engine and order snapshot builder unchanged.
        // It is never linked to the customer, so their own active web cart is left untouched.
        const merged = new Map<string, number>();
        for (const i of data.items) merged.set(i.variantId, (merged.get(i.variantId) ?? 0) + i.quantity);
        const created = await tx.cart.create({
          data: { token: newCartToken(), customerId: null, status: "ACTIVE", items: { create: [...merged].map(([variantId, quantity]) => ({ variantId, quantity })) } },
        });
        const cart = await tx.cart.findUniqueOrThrow({ where: { id: created.id }, include: { items: { include: cartItemInclude, orderBy: { createdAt: "asc" } } } });

        const quote = await buildQuote(tx, cart, { customerId: customer?.id ?? null, couponCode: data.couponCode, fulfillmentType: "PICKUP", paymentMethod: data.paymentMethod });
        if (quote.issues.length) throw invalid(quote.issues[0]);
        if (data.couponCode && quote.pricing.couponStatus !== "applied") throw invalid(couponMessage(quote.pricing.couponStatus));
        if (quote.lines.some((l) => l.lens)) throw invalid("نقطة البيع لا تدعم العدسات الطبية حالياً");

        const total = quote.pricing.total;
        let change = 0;
        if (data.paymentMethod === "CASH") {
          if (data.cashTendered === null) throw invalid("أدخل المبلغ المستلم من العميل");
          if (data.cashTendered < total) throw invalid(`المبلغ المستلم أقل من الإجمالي (${formatMoney(total)})`);
          change = data.cashTendered - total;
        }

        const number = await nextNumber(tx, "order", "SH");
        const contactName = customer ? [customer.firstName, customer.lastName].filter(Boolean).join(" ") : "عميل نقطة البيع";
        const order = await tx.order.create({
          data: buildOrderData(
            quote,
            cart,
            {
              fulfillmentType: "PICKUP",
              contactName,
              contactEmail: customer?.email ?? null,
              contactPhone: customer?.phone ?? "",
              couponCode: data.couponCode,
              customerNote: data.note,
              idempotencyKey: data.idempotencyKey,
              analyticsSessionId: null,
              paymentMethod: data.paymentMethod,
            },
            { number, branchId: branch.id, initialStatus: "READY_FOR_PICKUP", address: null, customerId: customer?.id ?? null, actor, channel: "POS" },
          ),
        });

        for (const [variantId, quantity] of merged) {
          await reserveStock(tx, { branchId: branch.id, variantId, quantity, referenceType: ORDER_REF, referenceId: order.id, expiresAt: null, actorId: actor.userId });
        }
        if (quote.pricing.applied.length) await redeemPromotions(tx, order.id, customer?.id ?? null, quote.pricing.applied.map((a) => ({ id: a.id, amount: a.amount })));

        await tx.payment.create({
          data: {
            orderId: order.id,
            provider: OFFLINE_PROVIDER[data.paymentMethod],
            method: data.paymentMethod,
            amount: total,
            providerData: data.paymentMethod === "CASH" ? { tendered: data.cashTendered, change } : { reference: data.cardReference },
            idempotencyKey: `${order.id}:pos`,
          },
        });
        await tx.cart.update({ where: { id: cart.id }, data: { status: "CONVERTED" } });
        await tx.orderEvent.create({ data: { orderId: order.id, type: "CREATED", toStatus: "READY_FOR_PICKUP", message: `بيع في ${branch.name}`, isPublic: true, actorId: actor.userId } });
        await audit(tx, actor, { action: "order.create", entityType: "order", entityId: order.id, branchId: branch.id, after: { number, total, items: quote.lines.length, channel: "POS" } });

        // Hand-over in the same transaction: consumes the reservation (SALE), confirms payment, loyalty.
        const locked = await lockOrder(tx, order.id);
        await applyTransition(tx, actor, locked, "DELIVERED", { collectPayment: true, note: "تم البيع والتسليم في الفرع" });
        return { orderId: order.id, number, total, change, duplicate: false };
      },
      { timeout: 20_000 },
    );
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      const dup = await db.order.findUnique({ where: { idempotencyKey: data.idempotencyKey }, select: { id: true, number: true, total: true } });
      if (dup) return { orderId: dup.id, number: dup.number, total: dup.total, change: 0, duplicate: true };
    }
    if (!(err instanceof DomainError)) logger.error({ err }, "placePosSale failed");
    throw err;
  }
}

/** Walk-in customers are optional; a phone links the sale to an existing profile or creates one. */
async function resolveCustomer(tx: Tx, phone: string | null, name: string | null) {
  if (!phone) return null;
  const found = await tx.customer.findFirst({ where: { phone }, orderBy: { createdAt: "asc" } });
  if (found) return found;
  if (!name) throw invalid("عميل جديد: أدخل اسم العميل مع رقم الموبايل");
  const [firstName, ...rest] = name.split(/\s+/);
  return tx.customer.create({ data: { firstName, lastName: rest.join(" ") || null, phone } });
}

/** Today's POS sales at the branches the actor can see (for the till summary). */
export async function posTodaySummary(actor: StaffActor, branchId: string, since: Date) {
  assertCan(actor, "pos.use", branchId);
  const orders = await db.order.findMany({
    where: { channel: "POS", fulfillmentBranchId: branchId, placedAt: { gte: since } },
    orderBy: { placedAt: "desc" },
    take: 20,
    select: { id: true, number: true, total: true, paymentMethod: true, status: true, placedAt: true, contactName: true },
  });
  const totals = await db.order.groupBy({
    by: ["paymentMethod"],
    where: { channel: "POS", fulfillmentBranchId: branchId, placedAt: { gte: since }, status: { notIn: ["CANCELLED"] } },
    _sum: { total: true },
    _count: true,
  });
  return { orders, totals: totals.map((t) => ({ method: t.paymentMethod, total: t._sum.total ?? 0, count: t._count })) };
}

/** Printable receipt for a POS sale at a branch the actor can access. */
export async function getPosReceipt(actor: StaffActor, orderId: string) {
  const order = await db.order.findFirst({
    where: { id: orderId, channel: "POS" },
    include: { items: true, payments: { where: { status: "SUCCEEDED" } }, fulfillmentBranch: { select: { name: true, phone: true } } },
  });
  if (!order) return null;
  assertCan(actor, "pos.use", order.fulfillmentBranchId);
  const cash = order.payments.find((p) => p.method === "CASH")?.providerData as { tendered?: number; change?: number } | null | undefined;
  return { ...order, tendered: cash?.tendered ?? null, change: cash?.change ?? null };
}
