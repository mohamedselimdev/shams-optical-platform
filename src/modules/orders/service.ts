import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { enqueue } from "@/server/jobs/queue";
import { getSetting } from "@/server/settings";
import { type Actor, type StaffActor, actorId, assertCan, branchScope, can } from "@/server/rbac/actor";
import { forbidden, invalid, invalidState, notFound } from "@/server/errors";
import type { OrderStatus, Prisma } from "@/generated/prisma/client";
import { consumeReservations, releaseReservations } from "../inventory/ledger";
import { reverseRedemptions } from "../promotions/service";
import { postLoyalty, reverseOrderLoyalty } from "../loyalty/service";
import { pointsForAmount } from "../pricing/engine";
import { CUSTOMER_VISIBLE, canTransition, STOCK_DEDUCTED_AT } from "./state";
import { ORDER_STATUS_LABELS } from "@/i18n/labels";

export const ORDER_REF = "order";

type OrderRow = Prisma.OrderGetPayload<{ include: { items: true } }>;

export async function lockOrder(tx: Tx, id: string): Promise<OrderRow> {
  await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${id} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) throw notFound("الطلب");
  return order;
}

export type TransitionContext = {
  note?: string | null;
  carrier?: string | null;
  trackingNumber?: string | null;
  /** For COD / pay-at-branch handover: confirm the money was collected. */
  collectPayment?: boolean;
  reason?: string | null;
};

/**
 * Core transition with all side effects, executed inside the caller's transaction:
 * stock deduction/release, loyalty, promotion reversal, payment collection, timeline, audit, notification.
 */
export async function applyTransition(tx: Tx, actor: Actor, order: OrderRow, to: OrderStatus, ctx: TransitionContext = {}) {
  const from = order.status;
  if (from === to) return order;
  if (!canTransition(from, to, order.fulfillmentType)) {
    throw invalidState(`لا يمكن تغيير حالة الطلب من "${ORDER_STATUS_LABELS[from]}" إلى "${ORDER_STATUS_LABELS[to]}"`);
  }
  const now = new Date();
  const data: Prisma.OrderUpdateInput = { status: to };

  if (to === "LENS_PREPARATION" && order.requiresPrescription) {
    const rxIds = order.items.map((i) => i.prescriptionId).filter((x): x is string => Boolean(x));
    const unverified = await tx.prescription.count({ where: { id: { in: rxIds }, status: { not: "VERIFIED" } } });
    if (unverified > 0) throw invalidState("يجب اعتماد الوصفات الطبية قبل تجهيز العدسات");
  }

  if (to === STOCK_DEDUCTED_AT[order.fulfillmentType]) {
    const costs = new Map(order.items.map((i) => [i.variantId, i.unitCost]));
    await consumeReservations(tx, ORDER_REF, order.id, { type: "SALE", actorId: actorId(actor), unitCostByVariant: costs });
  }

  if (to === "SHIPPED") {
    if (!ctx.carrier) throw invalid("اختر شركة الشحن");
    await tx.shipment.create({ data: { orderId: order.id, carrier: ctx.carrier, trackingNumber: ctx.trackingNumber ?? null, status: "SHIPPED", shippedAt: now } });
  }

  if (to === "DELIVERED") {
    const outstanding = order.total - order.paidTotal;
    if (outstanding > 0) {
      if (!ctx.collectPayment || !["COD", "PAY_AT_BRANCH"].includes(order.paymentMethod)) {
        throw invalidState("لا يمكن إتمام التسليم قبل تحصيل المبلغ المستحق");
      }
      await collectOfflinePayment(tx, actor, order, outstanding);
      data.paidTotal = order.total;
      data.paymentStatus = "PAID";
      data.paidAt = now;
    }
    data.completedAt = now;
    await tx.shipment.updateMany({ where: { orderId: order.id, status: "SHIPPED" }, data: { status: "DELIVERED", deliveredAt: now } });
    for (const item of order.items) {
      await tx.product.update({ where: { id: item.productId }, data: { salesCount: { increment: item.quantity } } });
    }
    const loyalty = await getSetting("loyalty", tx);
    if (order.customerId && loyalty.enabled) {
      const eligible = order.total - order.shippingTotal - order.codFee;
      const points = pointsForAmount(Math.max(0, eligible), loyalty.pointsPerEgp);
      const already = await tx.loyaltyTransaction.count({ where: { orderId: order.id, type: "EARN" } });
      if (points > 0 && already === 0) {
        await postLoyalty(tx, { customerId: order.customerId, type: "EARN", points, orderId: order.id, reason: `طلب ${order.number}` });
      }
    }
  }

  if (to === "CANCELLED") {
    if (order.paidTotal - order.refundedTotal > 0) {
      throw invalidState("الطلب مدفوع؛ نفّذ استرداد المبلغ أولاً ثم ألغِ الطلب");
    }
    await releaseReservations(tx, ORDER_REF, order.id, { reason: ctx.reason ?? "order cancelled", actorId: actorId(actor) });
    await reverseRedemptions(tx, order.id);
    if (order.customerId) await reverseOrderLoyalty(tx, order.id, order.customerId, ["REDEEM"]);
    await tx.payment.updateMany({ where: { orderId: order.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } }, data: { status: "CANCELLED" } });
    data.cancelledAt = now;
    data.cancelReason = ctx.reason ?? null;
  }

  const updated = await tx.order.update({ where: { id: order.id }, data, include: { items: true } });
  const isPublic = CUSTOMER_VISIBLE.includes(to);
  await tx.orderEvent.create({
    data: {
      orderId: order.id,
      type: "STATUS_CHANGED",
      fromStatus: from,
      toStatus: to,
      message: ctx.note ?? ctx.reason ?? null,
      isPublic,
      actorId: actorId(actor),
      data: ctx.trackingNumber ? { carrier: ctx.carrier, trackingNumber: ctx.trackingNumber } : undefined,
    },
  });
  await audit(tx, actor, {
    action: to === "CANCELLED" ? "order.cancel" : "order.status",
    entityType: "order",
    entityId: order.id,
    branchId: order.fulfillmentBranchId,
    before: { status: from },
    after: { status: to },
    metadata: ctx.reason ? { reason: ctx.reason } : undefined,
  });
  if (isPublic) await enqueue(tx, "notify.order_status", { orderId: order.id, status: to }, { dedupeKey: `notify:${order.id}:${to}:${now.getTime()}` });
  return updated;
}

async function collectOfflinePayment(tx: Tx, actor: Actor, order: OrderRow, amount: number) {
  const pending = await tx.payment.findFirst({ where: { orderId: order.id, status: "PENDING", method: order.paymentMethod } });
  if (pending && pending.amount === amount) {
    await tx.payment.update({ where: { id: pending.id }, data: { status: "SUCCEEDED", confirmedAt: new Date(), createdById: actorId(actor) } });
  } else {
    if (pending) await tx.payment.update({ where: { id: pending.id }, data: { status: "CANCELLED" } });
    await tx.payment.create({
      data: {
        orderId: order.id,
        provider: order.paymentMethod === "COD" ? "cod" : "branch",
        method: order.paymentMethod,
        amount,
        status: "SUCCEEDED",
        idempotencyKey: `collect:${order.id}:${Date.now()}`,
        confirmedAt: new Date(),
        createdById: actorId(actor),
      },
    });
  }
  await tx.orderEvent.create({ data: { orderId: order.id, type: "PAYMENT", message: "تم تحصيل المبلغ", actorId: actorId(actor), data: { amount } } });
  await audit(tx, actor, { action: "payment.manual_confirm", entityType: "order", entityId: order.id, after: { amount, method: order.paymentMethod } });
}

export const transitionSchema = z.object({
  to: z.enum(["PROCESSING", "PRESCRIPTION_REVIEW", "LENS_PREPARATION", "READY", "SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "CANCELLED"]),
  note: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(500).optional(),
  carrier: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
  collectPayment: z.union([z.literal("on"), z.literal("true"), z.boolean()]).optional().transform((v) => v === true || v === "on" || v === "true"),
});

/** Staff-triggered transition with permission + branch checks. */
export async function transitionOrder(actor: StaffActor, orderId: string, input: z.input<typeof transitionSchema>) {
  const data = transitionSchema.parse(input);
  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    const permission = data.to === "CANCELLED" ? "orders.cancel" : "orders.update";
    assertCan(actor, permission, order.fulfillmentBranchId);
    if (data.to === "CANCELLED" && !data.reason) throw invalid("سبب الإلغاء مطلوب");
    if (data.to === "LENS_PREPARATION" && !can(actor, "prescriptions.read")) throw forbidden();
    return applyTransition(tx, actor, order, data.to, data);
  });
}

export async function addOrderNote(actor: StaffActor, orderId: string, message: string, isPublic: boolean) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { fulfillmentBranchId: true } });
  if (!order) throw notFound("الطلب");
  assertCan(actor, "orders.update", order.fulfillmentBranchId);
  const text = message.trim();
  if (!text) throw invalid("اكتب الملاحظة");
  await db.orderEvent.create({ data: { orderId, type: "NOTE", message: text.slice(0, 1000), isPublic, actorId: actor.userId } });
}

export type OrderListFilter = { status?: OrderStatus; branchId?: string; q?: string; from?: Date; to?: Date; channel?: string; page?: number };

export async function listOrders(actor: StaffActor, f: OrderListFilter) {
  assertCan(actor, "orders.read", f.branchId);
  const page = Math.max(f.page ?? 1, 1);
  const where: Prisma.OrderWhereInput = {
    ...branchScope(actor, "fulfillmentBranchId"),
    ...(f.status ? { status: f.status } : {}),
    ...(f.branchId ? { fulfillmentBranchId: f.branchId } : {}),
    ...(f.channel ? { channel: f.channel as never } : {}),
    ...(f.from || f.to ? { placedAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.q
      ? { OR: [{ number: { contains: f.q, mode: "insensitive" } }, { contactPhone: { contains: f.q } }, { contactName: { contains: f.q, mode: "insensitive" } }, { contactEmail: { contains: f.q, mode: "insensitive" } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.order.findMany({
      where,
      select: {
        id: true, number: true, status: true, paymentStatus: true, paymentMethod: true, fulfillmentType: true, total: true, placedAt: true,
        contactName: true, contactPhone: true, channel: true, requiresPrescription: true,
        fulfillmentBranch: { select: { name: true } }, _count: { select: { items: true } },
      },
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * 30,
      take: 30,
    }),
    db.order.count({ where }),
  ]);
  return { items, total, page, pageSize: 30 };
}

export async function getOrderForStaff(actor: StaffActor, id: string) {
  assertCan(actor, "orders.read");
  const order = await db.order.findFirst({
    where: { id, ...branchScope(actor, "fulfillmentBranchId") },
    include: {
      items: true,
      events: { orderBy: { createdAt: "asc" } },
      payments: { orderBy: { createdAt: "asc" }, include: { refunds: true } },
      refunds: { orderBy: { createdAt: "asc" } },
      shipments: true,
      returns: { select: { id: true, number: true, status: true } },
      customer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      fulfillmentBranch: { select: { id: true, name: true } },
      pickupBranch: { select: { id: true, name: true } },
      redemptions: { include: { promotion: { select: { name: true, code: true } } } },
    },
  });
  if (!order) throw notFound("الطلب");
  return order;
}

/** Customer-safe order view: only their own orders, public timeline only. */
export async function getOrderForCustomer(customerId: string, number: string) {
  const order = await db.order.findFirst({
    where: { number, customerId },
    include: {
      items: true,
      events: { where: { isPublic: true }, orderBy: { createdAt: "asc" } },
      shipments: { select: { carrier: true, trackingNumber: true, status: true, shippedAt: true, deliveredAt: true } },
      pickupBranch: { select: { name: true, addressLine: true, city: true, phone: true } },
      returns: { select: { id: true, number: true, status: true } },
    },
  });
  if (!order) throw notFound("الطلب");
  const { idempotencyKey: _k, analyticsSessionId: _s, createdById: _c, ...safe } = order;
  return { ...safe, items: order.items.map(({ unitCost: _cost, ...i }) => i) };
}

/** Guest tracking: order number + phone must both match. */
export async function trackOrder(number: string, phone: string) {
  const order = await db.order.findFirst({
    where: { number: number.trim().toUpperCase(), contactPhone: phone },
    select: {
      number: true, status: true, placedAt: true, fulfillmentType: true, total: true,
      events: { where: { isPublic: true }, orderBy: { createdAt: "asc" }, select: { toStatus: true, message: true, createdAt: true, type: true } },
      shipments: { select: { carrier: true, trackingNumber: true, status: true } },
      pickupBranch: { select: { name: true, addressLine: true } },
    },
  });
  return order;
}

export async function listCustomerOrders(customerId: string) {
  return db.order.findMany({
    where: { customerId },
    select: { id: true, number: true, status: true, total: true, placedAt: true, paymentStatus: true, fulfillmentType: true, _count: { select: { items: true } } },
    orderBy: { placedAt: "desc" },
  });
}

/** Expire unpaid online orders after the configured TTL: release stock, reverse promos/loyalty. */
export async function expirePendingOrders(now = new Date()) {
  const checkout = await getSetting("checkout");
  const cutoff = new Date(now.getTime() - checkout.pendingPaymentTtlMinutes * 60_000);
  const stale = await db.order.findMany({ where: { status: "PENDING_PAYMENT", placedAt: { lt: cutoff } }, select: { id: true }, take: 100 });
  let expired = 0;
  for (const { id } of stale) {
    await db.$transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (order.status !== "PENDING_PAYMENT" || order.paidTotal > 0) return;
      await applyTransition(tx, { kind: "system", reason: "payment timeout" }, order, "CANCELLED", { reason: "انتهت مهلة الدفع" });
      expired++;
    });
  }
  return expired;
}
