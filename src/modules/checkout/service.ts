import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { nextNumber } from "@/server/counters";
import { getSetting } from "@/server/settings";
import { logger } from "@/server/logger";
import { type Actor, actorId } from "@/server/rbac/actor";
import { DomainError, invalid } from "@/server/errors";
import { zEgyptPhone, zText } from "@/lib/validation";
import { isGovernorate } from "@/lib/egypt";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus, PaymentMethod } from "@/generated/prisma/enums";
import { findActiveCart, type CartWithItems } from "../cart/service";
import { reserveStock } from "../inventory/ledger";
import { redeemPromotions } from "../promotions/service";
import { postLoyalty } from "../loyalty/service";
import { providerForMethod } from "../payments/registry";
import { buildQuote, type Quote } from "./quote";
import { ORDER_REF } from "../orders/service";
import type { Locale } from "@/i18n/config";

export const addressSchema = z.object({
  fullName: zText(120),
  phone: zEgyptPhone,
  governorate: z.string().refine(isGovernorate, "اختر المحافظة"),
  city: zText(80),
  area: z.string().trim().max(80).optional().transform((v) => v || null),
  street: zText(200),
  building: z.string().trim().max(40).optional().transform((v) => v || null),
  floor: z.string().trim().max(20).optional().transform((v) => v || null),
  apartment: z.string().trim().max(20).optional().transform((v) => v || null),
  landmark: z.string().trim().max(200).optional().transform((v) => v || null),
});

export const checkoutSchema = z
  .object({
    idempotencyKey: z.string().min(16).max(80),
    contactName: zText(120),
    contactEmail: z.union([z.literal(""), z.string().trim().toLowerCase().email("بريد غير صالح")]).optional().transform((v) => v || null),
    contactPhone: zEgyptPhone,
    fulfillmentType: z.enum(["DELIVERY", "PICKUP"]),
    pickupBranchId: z.string().optional().transform((v) => v || null),
    shippingRateId: z.string().optional().transform((v) => v || null),
    addressId: z.string().optional().transform((v) => v || null),
    address: addressSchema.optional(),
    paymentMethod: z.enum(["CARD", "WALLET", "COD", "PAY_AT_BRANCH"]),
    couponCode: z.string().trim().max(30).optional().transform((v) => v || null),
    loyaltyPoints: z.coerce.number().int().min(0).max(10_000_000).default(0),
    prescriptionConfirmed: z.union([z.literal("on"), z.literal("true"), z.boolean()]).optional().transform((v) => v === true || v === "on" || v === "true"),
    customerNote: z.string().trim().max(500).optional().transform((v) => v || null),
    analyticsSessionId: z.string().max(64).optional().transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.fulfillmentType === "PICKUP" && !v.pickupBranchId) ctx.addIssue({ code: "custom", path: ["pickupBranchId"], message: "اختر فرع الاستلام" });
    if (v.fulfillmentType === "DELIVERY") {
      if (!v.addressId && !v.address) ctx.addIssue({ code: "custom", path: ["address"], message: "أدخل عنوان التوصيل" });
      if (!v.shippingRateId) ctx.addIssue({ code: "custom", path: ["shippingRateId"], message: "اختر طريقة الشحن" });
    }
    if (v.paymentMethod === "COD" && v.fulfillmentType !== "DELIVERY") ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "الدفع عند الاستلام متاح للتوصيل فقط" });
    if (v.paymentMethod === "PAY_AT_BRANCH" && v.fulfillmentType !== "PICKUP") ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "الدفع في الفرع متاح عند الاستلام من الفرع فقط" });
  });

export type CheckoutInput = z.input<typeof checkoutSchema>;

export type PlaceOrderResult = { orderId: string; number: string; requiresOnlinePayment: boolean; paymentMethod: PaymentMethod; duplicate: boolean };

/**
 * Place an order from the active cart. Everything the browser sent is re-derived from the database:
 * prices, lens prices, promotions, loyalty, shipping, tax and stock. Stock is reserved with
 * atomic conditional updates; any failure rolls back the whole order. The idempotency key makes
 * double-submits return the original order instead of creating a duplicate.
 */
export async function placeOrder(
  ctx: { actor: Actor | null; customerId: string | null; cartToken: string | null; locale?: Locale },
  input: CheckoutInput,
): Promise<PlaceOrderResult> {
  const data = checkoutSchema.parse(input);
  const existing = await db.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
  if (existing) return resultFor(existing, true);

  const checkoutSettings = await getSetting("checkout");
  if (data.paymentMethod === "COD" && !checkoutSettings.codEnabled) throw invalid("الدفع عند الاستلام غير متاح حالياً");
  if (data.paymentMethod === "PAY_AT_BRANCH" && !checkoutSettings.payAtBranchEnabled) throw invalid("الدفع في الفرع غير متاح حالياً");
  if ((data.paymentMethod === "CARD" && !checkoutSettings.cardEnabled) || (data.paymentMethod === "WALLET" && !checkoutSettings.walletEnabled)) throw invalid("طريقة الدفع غير متاحة");
  if ((data.paymentMethod === "CARD" || data.paymentMethod === "WALLET") && !providerForMethod(data.paymentMethod)) {
    throw new DomainError("PAYMENT", "الدفع الإلكتروني غير متاح حالياً، اختر طريقة دفع أخرى");
  }
  if (data.loyaltyPoints > 0 && !ctx.customerId) throw invalid("سجّل الدخول لاستخدام نقاط الولاء");

  try {
    return await db.$transaction(
      async (tx) => {
        if (ctx.customerId) {
          // Serialise a customer's concurrent checkouts (per-customer promo limits, loyalty balance).
          await tx.$queryRaw`SELECT "id" FROM "customer" WHERE "id" = ${ctx.customerId} FOR UPDATE`;
        }
        const cart = await findActiveCart(tx, { token: ctx.cartToken, customerId: ctx.customerId });
        if (!cart || cart.items.length === 0) throw invalid("السلة فارغة");
        if (cart.status !== "ACTIVE") throw invalid("السلة لم تعد صالحة");

        const address = await resolveAddress(tx, data, ctx.customerId);
        const quote = await buildQuote(tx, cart, {
          customerId: ctx.customerId,
          couponCode: data.couponCode,
          fulfillmentType: data.fulfillmentType,
          governorate: address?.governorate ?? null,
          shippingRateId: data.shippingRateId,
          paymentMethod: data.paymentMethod,
          loyaltyPoints: data.loyaltyPoints,
        });
        if (quote.issues.length) throw invalid(quote.issues[0]);
        if (data.couponCode && quote.pricing.couponStatus !== "applied") throw invalid(couponMessage(quote.pricing.couponStatus));
        if (quote.requiresPrescription && !data.prescriptionConfirmed) throw invalid("يرجى تأكيد صحة بيانات الوصفة الطبية");
        if (data.paymentMethod === "COD") {
          if (!quote.shippingRate?.codAllowed) throw invalid("الدفع عند الاستلام غير متاح لطريقة الشحن المختارة");
          if (quote.pricing.total > checkoutSettings.codMaxTotal) throw invalid("قيمة الطلب تتجاوز الحد المسموح للدفع عند الاستلام");
        }
        if (quote.pricing.total <= 0 && (data.paymentMethod === "CARD" || data.paymentMethod === "WALLET")) throw invalid("قيمة الطلب غير صالحة للدفع الإلكتروني");

        const branchId = await chooseFulfillmentBranch(tx, cart, data.fulfillmentType, data.pickupBranchId, checkoutSettings.onlineFulfillmentBranchId);
        const online = data.paymentMethod === "CARD" || data.paymentMethod === "WALLET";
        const initialStatus: OrderStatus = online ? "PENDING_PAYMENT" : quote.requiresPrescription ? "PRESCRIPTION_REVIEW" : "PROCESSING";
        const number = await nextNumber(tx, "order", "SH");
        const order = await tx.order.create({ data: buildOrderData(quote, cart, data, { number, branchId, initialStatus, address, customerId: ctx.customerId, actor: ctx.actor, locale: ctx.locale }) });

        const expiresAt = online ? new Date(Date.now() + checkoutSettings.pendingPaymentTtlMinutes * 60_000) : null;
        const qtyByVariant = new Map<string, number>();
        for (const l of quote.lines) qtyByVariant.set(l.item.variantId, (qtyByVariant.get(l.item.variantId) ?? 0) + l.item.quantity);
        for (const [variantId, quantity] of qtyByVariant) {
          await reserveStock(tx, { branchId, variantId, quantity, referenceType: ORDER_REF, referenceId: order.id, expiresAt, actorId: actorId(ctx.actor) });
        }

        if (quote.pricing.applied.length) await redeemPromotions(tx, order.id, ctx.customerId, quote.pricing.applied.map((a) => ({ id: a.id, amount: a.amount })));
        if (quote.pricing.loyaltyPointsRedeemed > 0 && ctx.customerId) {
          await postLoyalty(tx, { customerId: ctx.customerId, type: "REDEEM", points: -quote.pricing.loyaltyPointsRedeemed, orderId: order.id, reason: `طلب ${number}` });
        }
        if (!online) {
          await tx.payment.create({
            data: { orderId: order.id, provider: data.paymentMethod === "COD" ? "cod" : "branch", method: data.paymentMethod, amount: quote.pricing.total, idempotencyKey: `${order.id}:offline` },
          });
        }
        if (ctx.customerId && address && data.address && !data.addressId) {
          const count = await tx.address.count({ where: { customerId: ctx.customerId } });
          await tx.address.create({ data: { ...data.address, customerId: ctx.customerId, isDefault: count === 0 } });
        }

        await tx.cart.update({ where: { id: cart.id }, data: { status: "CONVERTED" } });
        await tx.orderEvent.create({ data: { orderId: order.id, type: "CREATED", toStatus: initialStatus, message: "تم استلام الطلب", isPublic: true, actorId: actorId(ctx.actor) } });
        await audit(tx, ctx.actor, { action: "order.create", entityType: "order", entityId: order.id, branchId, after: { number, total: quote.pricing.total, items: quote.lines.length } });
        if (data.analyticsSessionId) {
          const session = await tx.analyticsSession.findUnique({ where: { id: data.analyticsSessionId } });
          if (session) await tx.analyticsEvent.create({ data: { sessionId: session.id, name: "purchase", orderId: order.id, value: quote.pricing.total, branchId } });
        }
        return resultFor(order, false);
      },
      { timeout: 20_000 },
    );
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      const dup = await db.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } });
      if (dup) return resultFor(dup, true);
    }
    if (!(err instanceof DomainError)) logger.error({ err }, "placeOrder failed");
    throw err;
  }
}

function resultFor(order: { id: string; number: string; paymentMethod: PaymentMethod; status: OrderStatus }, duplicate: boolean): PlaceOrderResult {
  return { orderId: order.id, number: order.number, paymentMethod: order.paymentMethod, requiresOnlinePayment: order.status === "PENDING_PAYMENT", duplicate };
}

export function couponMessage(status: string) {
  switch (status) {
    case "not_found":
      return "الكوبون غير صالح أو منتهي";
    case "min_subtotal":
      return "قيمة السلة أقل من الحد الأدنى للكوبون";
    case "not_combinable":
      return "لا يمكن جمع الكوبون مع العرض المطبق حالياً";
    case "not_eligible":
      return "الكوبون لا ينطبق على منتجات السلة";
    default:
      return "";
  }
}

async function resolveAddress(tx: Tx, data: z.infer<typeof checkoutSchema>, customerId: string | null) {
  if (data.fulfillmentType !== "DELIVERY") return null;
  if (data.addressId) {
    if (!customerId) throw invalid("العنوان غير متاح");
    const a = await tx.address.findFirst({ where: { id: data.addressId, customerId } });
    if (!a) throw invalid("العنوان غير موجود");
    const { id: _id, customerId: _c, createdAt: _cr, updatedAt: _u, isDefault: _d, label: _l, ...rest } = a;
    return rest;
  }
  return data.address!;
}

/**
 * Pickup orders reserve at the chosen branch. Delivery orders use the configured online
 * fulfillment branch if it can supply the whole order, otherwise the first online-shipping
 * branch that can (single-branch fulfillment; split shipments are not yet supported).
 */
async function chooseFulfillmentBranch(tx: Tx, cart: CartWithItems, type: "DELIVERY" | "PICKUP", pickupBranchId: string | null, preferred: string | null) {
  const need = new Map<string, number>();
  for (const i of cart.items) need.set(i.variantId, (need.get(i.variantId) ?? 0) + i.quantity);

  const canSupply = async (branchId: string) => {
    const rows = await tx.inventoryItem.findMany({ where: { branchId, variantId: { in: [...need.keys()] } }, select: { variantId: true, onHand: true, reserved: true } });
    const avail = new Map(rows.map((r) => [r.variantId, r.onHand - r.reserved]));
    return [...need].every(([v, q]) => (avail.get(v) ?? 0) >= q);
  };

  if (type === "PICKUP") {
    const branch = await tx.branch.findFirst({ where: { id: pickupBranchId!, isActive: true, pickupEnabled: true, type: "STORE" } });
    if (!branch) throw invalid("فرع الاستلام غير متاح");
    if (!(await canSupply(branch.id))) throw new DomainError("INSUFFICIENT_STOCK", `بعض المنتجات غير متوفرة في ${branch.name}؛ اختر فرعاً آخر أو التوصيل`);
    return branch.id;
  }
  const candidates = await tx.branch.findMany({ where: { isActive: true, shipsOnline: true }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  const ordered = [...(preferred ? candidates.filter((c) => c.id === preferred) : []), ...candidates.filter((c) => c.id !== preferred)];
  for (const c of ordered) if (await canSupply(c.id)) return c.id;
  throw new DomainError("INSUFFICIENT_STOCK", "بعض المنتجات غير متوفرة للتوصيل حالياً");
}

/** The order-level fields shared by web checkout and POS. */
export type OrderDataInput = Pick<
  z.infer<typeof checkoutSchema>,
  "fulfillmentType" | "contactName" | "contactEmail" | "contactPhone" | "couponCode" | "customerNote" | "idempotencyKey" | "analyticsSessionId"
> & { paymentMethod: PaymentMethod };

export function buildOrderData(
  quote: Quote,
  cart: CartWithItems,
  data: OrderDataInput,
  extra: { number: string; branchId: string; initialStatus: OrderStatus; address: unknown; customerId: string | null; actor: Actor | null; channel?: "WEB" | "POS" | "ADMIN"; locale?: Locale },
): Prisma.OrderUncheckedCreateInput {
  const p = quote.pricing;
  const priced = new Map(p.lines.map((l) => [l.key, l]));
  return {
    number: extra.number,
    customerId: extra.customerId,
    channel: extra.channel ?? "WEB",
    locale: extra.locale ?? "ar",
    status: extra.initialStatus,
    paymentStatus: "UNPAID",
    paymentMethod: data.paymentMethod,
    fulfillmentType: data.fulfillmentType,
    fulfillmentBranchId: extra.branchId,
    pickupBranchId: data.fulfillmentType === "PICKUP" ? extra.branchId : null,
    contactName: data.contactName,
    contactEmail: data.contactEmail,
    contactPhone: data.contactPhone,
    shippingAddress: extra.address ? (extra.address as Prisma.InputJsonValue) : undefined,
    shippingMethod: quote.shippingRate?.name ?? null,
    subtotal: p.subtotal,
    discountTotal: p.discountTotal,
    shippingTotal: p.shippingTotal,
    codFee: p.codFee,
    loyaltyDiscount: p.loyaltyDiscount,
    loyaltyPointsRedeemed: p.loyaltyPointsRedeemed,
    taxTotal: p.taxTotal,
    total: p.total,
    couponCode: p.couponStatus === "applied" ? data.couponCode?.toUpperCase() ?? null : null,
    requiresPrescription: quote.requiresPrescription,
    customerNote: data.customerNote,
    idempotencyKey: data.idempotencyKey,
    cartId: cart.id,
    analyticsSessionId: data.analyticsSessionId,
    createdById: actorId(extra.actor),
    items: {
      create: quote.lines.map((l) => {
        const pl = priced.get(l.item.id)!;
        const v = l.item.variant;
        const variantName = [v.colorName, v.sizeLabel].filter(Boolean).join(" / ") || null;
        const variantNameEn = v.colorNameEn ? [v.colorNameEn, v.sizeLabel].filter(Boolean).join(" / ") : null;
        return {
          variantId: v.id,
          productId: v.product.id,
          sku: v.sku,
          productName: v.product.name,
          productNameEn: v.product.nameEn ?? null,
          variantName,
          variantNameEn,
          brandName: v.product.brand?.name ?? null,
          brandId: v.product.brand?.id ?? null,
          categoryId: v.product.category?.id ?? null,
          imageUrl: v.product.images[0]?.url ?? null,
          quantity: l.item.quantity,
          unitPrice: pl.unitPrice,
          lensUnitPrice: pl.lensUnitPrice,
          unitCost: v.costPrice,
          lineSubtotal: pl.lineSubtotal,
          discountTotal: pl.discount + pl.loyaltyDiscount,
          taxTotal: pl.tax,
          lineTotal: pl.lineTotal,
          taxRateBps: pl.taxRateBps,
          lensSnapshot: l.lens ? (l.lens as unknown as Prisma.InputJsonValue) : undefined,
          prescriptionMode: l.item.prescriptionMode,
          prescriptionId: l.prescription?.id ?? null,
          prescriptionSnapshot: l.prescription ? (l.prescription as unknown as Prisma.InputJsonValue) : undefined,
          returnable: !l.lens,
        };
      }),
    },
  };
}
