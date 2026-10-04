import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { env } from "@/server/env";
import { enqueue } from "@/server/jobs/queue";
import { logger } from "@/server/logger";
import { type Actor, type StaffActor, actorId, assertCan, systemActor } from "@/server/rbac/actor";
import { DomainError, invalid, invalidState, notFound } from "@/server/errors";
import { zEgp } from "@/lib/validation";
import { toEgpString } from "@/lib/money";
import type { Prisma } from "@/generated/prisma/client";
import type { PaymentMethod } from "@/generated/prisma/enums";
import type { WebhookEvent, WebhookRequest } from "./provider";
import { getProvider, providerForMethod } from "./registry";
import { applyTransition, lockOrder } from "../orders/service";

/**
 * Payments. Truth comes only from verified provider webhooks (or server-side reconciliation),
 * never from the browser's return URL. Webhook processing is idempotent at two levels:
 * the (provider, eventId) unique key on webhook_event, and the locked payment's current status.
 */

export async function initiateOnlinePayment(orderId: string, method: PaymentMethod) {
  const provider = providerForMethod(method);
  if (!provider) throw new DomainError("PAYMENT", "طريقة الدفع غير متاحة حالياً");
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound("الطلب");
  if (order.status !== "PENDING_PAYMENT") throw invalidState("الطلب لا ينتظر الدفع");

  const attempt = (await db.payment.count({ where: { orderId } })) + 1;
  const payment = await db.payment.create({
    data: { orderId, provider: provider.key, method, amount: order.total - order.paidTotal, idempotencyKey: `${orderId}:${attempt}` },
  });
  try {
    const result = await provider.createPayment({
      paymentId: payment.id,
      orderNumber: order.number,
      amount: payment.amount,
      currency: order.currency,
      method,
      customer: { name: order.contactName, email: order.contactEmail, phone: order.contactPhone },
      returnUrl: `${env.APP_URL}/checkout/result?order=${encodeURIComponent(order.number)}`,
      webhookUrl: `${env.APP_URL}/api/webhooks/payments/${provider.key}`,
    });
    const updated = await db.payment.update({
      where: { id: payment.id },
      data: { externalId: result.externalId, redirectUrl: result.redirectUrl, status: result.status === "PENDING" ? "PENDING" : "FAILED" },
    });
    await db.order.update({ where: { id: orderId }, data: { paymentStatus: "PENDING" } });
    return updated;
  } catch (err) {
    logger.error({ err, paymentId: payment.id }, "payment initiation failed");
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "initiation_failed" } });
    throw new DomainError("PAYMENT", "تعذر بدء عملية الدفع، يرجى المحاولة مرة أخرى");
  }
}

export type WebhookOutcome = "processed" | "duplicate" | "invalid_signature" | "ignored";

export async function handleWebhook(providerKey: string, req: WebhookRequest): Promise<WebhookOutcome> {
  const provider = getProvider(providerKey);
  if (!provider || !provider.isConfigured()) return "ignored";
  let event: WebhookEvent | null = null;
  try {
    event = await provider.parseWebhook(req);
  } catch (err) {
    logger.warn({ err, providerKey }, "webhook parse error");
  }
  if (!event) {
    logger.warn({ providerKey }, "webhook rejected: invalid signature");
    return "invalid_signature";
  }

  // First line of idempotency: one row per provider event id.
  try {
    await db.webhookEvent.create({
      data: { provider: providerKey, eventId: event.eventId, eventType: `${event.type}.${event.status}`, signatureValid: true, payload: event.raw as Prisma.InputJsonValue },
    });
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") return "duplicate";
    throw err;
  }

  try {
    if (event.type === "payment") await applyPaymentResult(providerKey, event);
    await db.webhookEvent.update({ where: { provider_eventId: { provider: providerKey, eventId: event.eventId } }, data: { status: "PROCESSED", processedAt: new Date() } });
    return "processed";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.webhookEvent.update({ where: { provider_eventId: { provider: providerKey, eventId: event.eventId } }, data: { status: "FAILED", error: message.slice(0, 500) } });
    throw err;
  }
}

/** Apply a provider-confirmed payment status. Safe to call repeatedly for the same payment. */
export async function applyPaymentResult(providerKey: string, event: Pick<WebhookEvent, "externalId" | "paymentId" | "status" | "amount" | "currency" | "failureReason">) {
  await db.$transaction(async (tx) => {
    const payment = await findPaymentForEvent(tx, providerKey, event);
    if (!payment) throw new Error(`Unknown payment for ${providerKey}:${event.externalId}`);
    await tx.$queryRaw`SELECT "id" FROM "payment" WHERE "id" = ${payment.id} FOR UPDATE`;
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (current.status === "SUCCEEDED") return; // already applied — duplicate delivery
    const order = await lockOrder(tx, current.orderId);

    if (event.status === "SUCCEEDED") {
      if (event.amount !== current.amount || event.currency !== current.currency) {
        await tx.payment.update({ where: { id: current.id }, data: { status: "FAILED", failureReason: "amount_mismatch" } });
        await tx.orderEvent.create({ data: { orderId: order.id, type: "PAYMENT", message: "مبلغ الدفع لا يطابق الطلب — يتطلب مراجعة", data: { expected: current.amount, received: event.amount } } });
        logger.error({ paymentId: current.id }, "payment amount mismatch");
        return;
      }
      await tx.payment.update({ where: { id: current.id }, data: { status: "SUCCEEDED", confirmedAt: new Date(), externalId: current.externalId ?? event.externalId } });
      const paidTotal = order.paidTotal + current.amount;
      await tx.order.update({ where: { id: order.id }, data: { paidTotal, paymentStatus: paidTotal >= order.total ? "PAID" : "PENDING", paidAt: new Date() } });
      await tx.orderEvent.create({ data: { orderId: order.id, type: "PAYMENT", message: "تم استلام الدفع", isPublic: false, data: { amount: current.amount, provider: providerKey } } });

      if (order.status === "PENDING_PAYMENT" && paidTotal >= order.total) {
        const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
        await applyTransition(tx, systemActor("payment webhook"), fresh, "PAID");
        // Clear the pending-payment expiry on reservations now that the order is paid.
        await tx.inventoryReservation.updateMany({ where: { referenceType: "order", referenceId: order.id, status: "ACTIVE" }, data: { expiresAt: null } });
      } else if (order.status === "CANCELLED") {
        // Money arrived after the order expired: never keep it silently.
        await tx.orderEvent.create({ data: { orderId: order.id, type: "PAYMENT", message: "دفع وصل بعد إلغاء الطلب — سيتم استرداده تلقائياً" } });
        await enqueue(tx, "payments.refund_orphan", { paymentId: current.id }, { dedupeKey: `orphan:${current.id}` });
      }
    } else if (event.status === "FAILED" || event.status === "CANCELLED" || event.status === "EXPIRED") {
      await tx.payment.update({ where: { id: current.id }, data: { status: event.status, failureReason: event.failureReason?.slice(0, 300) ?? null } });
      const stillPending = await tx.payment.count({ where: { orderId: order.id, status: { in: ["PENDING", "REQUIRES_ACTION"] } } });
      if (order.paidTotal === 0 && stillPending === 0) await tx.order.update({ where: { id: order.id }, data: { paymentStatus: "FAILED" } });
      await tx.orderEvent.create({ data: { orderId: order.id, type: "PAYMENT", message: "فشلت محاولة الدفع", data: { reason: event.failureReason ?? null } } });
    }
  });
}

async function findPaymentForEvent(tx: Tx, providerKey: string, event: Pick<WebhookEvent, "externalId" | "paymentId">) {
  if (event.paymentId) {
    const byId = await tx.payment.findFirst({ where: { id: event.paymentId, provider: providerKey } });
    if (byId) return byId;
  }
  return tx.payment.findFirst({ where: { provider: providerKey, externalId: event.externalId } });
}

export const refundSchema = z.object({
  paymentId: z.string().min(1),
  amount: zEgp,
  reason: z.string().trim().min(3, "سبب الاسترداد مطلوب").max(300),
  returnId: z.string().optional(),
});

/**
 * Refund up to the payment's refundable balance (amount − refunded − pending refunds) and the
 * order's net paid amount. Database CHECK constraints are a second safety net.
 */
export async function refundPayment(actor: Actor, input: z.input<typeof refundSchema>) {
  const data = refundSchema.parse(input);
  if (data.amount <= 0) throw invalid("مبلغ الاسترداد يجب أن يكون أكبر من صفر");

  const refund = await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: data.paymentId } });
    if (!payment) throw notFound("عملية الدفع");
    const order = await lockOrder(tx, payment.orderId);
    assertCan(actor, "payments.refund", order.fulfillmentBranchId);
    await tx.$queryRaw`SELECT "id" FROM "payment" WHERE "id" = ${payment.id} FOR UPDATE`;
    if (payment.status !== "SUCCEEDED") throw invalidState("لا يمكن استرداد عملية دفع غير ناجحة");
    const pending = await tx.refund.aggregate({ where: { paymentId: payment.id, status: "PENDING" }, _sum: { amount: true } });
    const refundable = Math.min(payment.amount - payment.refundedAmount - (pending._sum.amount ?? 0), order.paidTotal - order.refundedTotal);
    if (data.amount > refundable) throw invalid(`أقصى مبلغ قابل للاسترداد ${(refundable / 100).toFixed(2)} ج.م`);
    const r = await tx.refund.create({
      data: { orderId: order.id, paymentId: payment.id, amount: data.amount, reason: data.reason, returnId: data.returnId ?? null, createdById: actorId(actor) ?? "system" },
    });
    await audit(tx, actor, { action: "payment.refund", entityType: "refund", entityId: r.id, branchId: order.fulfillmentBranchId, after: { amount: data.amount, paymentId: payment.id, orderId: order.id }, metadata: { reason: data.reason } });
    return { refund: r, payment };
  });

  // Provider call outside the DB transaction; the PENDING refund already holds the amount.
  const provider = getProvider(refund.payment.provider);
  let outcome: { status: "SUCCEEDED" | "PENDING" | "FAILED"; externalId: string; failureReason?: string };
  if (provider && !["cod", "branch", "pos_cash", "pos_card"].includes(refund.payment.provider)) {
    try {
      outcome = await provider.refund({ externalId: refund.payment.externalId ?? "", amount: data.amount, reason: data.reason });
    } catch (err) {
      logger.error({ err, refundId: refund.refund.id }, "provider refund failed");
      outcome = { status: "FAILED", externalId: "", failureReason: "provider_error" };
    }
  } else {
    // Offline methods: staff hands back cash / reverses at the terminal; recorded as completed.
    outcome = { status: "SUCCEEDED", externalId: `manual:${refund.refund.id}` };
  }
  await settleRefund(refund.refund.id, outcome);
  return db.refund.findUniqueOrThrow({ where: { id: refund.refund.id } });
}

export async function settleRefund(refundId: string, outcome: { status: "SUCCEEDED" | "PENDING" | "FAILED"; externalId: string; failureReason?: string }) {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "refund" WHERE "id" = ${refundId} FOR UPDATE`;
    const r = await tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    if (r.status !== "PENDING") return;
    if (outcome.status === "PENDING") {
      await tx.refund.update({ where: { id: r.id }, data: { externalId: outcome.externalId || null } });
      return;
    }
    if (outcome.status === "FAILED") {
      await tx.refund.update({ where: { id: r.id }, data: { status: "FAILED", failureReason: outcome.failureReason ?? null, completedAt: new Date() } });
      await tx.orderEvent.create({ data: { orderId: r.orderId, type: "REFUND", message: "فشل الاسترداد", data: { amount: r.amount } } });
      return;
    }
    const order = await lockOrder(tx, r.orderId);
    await tx.payment.update({ where: { id: r.paymentId }, data: { refundedAmount: { increment: r.amount } } });
    const refundedTotal = order.refundedTotal + r.amount;
    await tx.order.update({
      where: { id: order.id },
      data: { refundedTotal, paymentStatus: refundedTotal >= order.paidTotal ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });
    await tx.refund.update({ where: { id: r.id }, data: { status: "SUCCEEDED", externalId: outcome.externalId || null, completedAt: new Date() } });
    await tx.orderEvent.create({ data: { orderId: order.id, type: "REFUND", message: `تم استرداد ${(r.amount / 100).toFixed(2)} ج.م`, isPublic: true, data: { amount: r.amount } } });
    if (refundedTotal >= order.paidTotal && ["DELIVERED", "RETURNED"].includes(order.status)) {
      const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
      await applyTransition(tx, systemActor("full refund"), fresh, "REFUNDED");
    }
  });
}

/** Automatic refund of a payment captured on an order that was already cancelled. */
export async function refundOrphanPayment(paymentId: string) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "SUCCEEDED") return;
  const remaining = payment.amount - payment.refundedAmount;
  if (remaining <= 0) return;
  await refundPayment(systemActor("orphan payment"), { paymentId, amount: toEgpString(remaining), reason: "دفع بعد إلغاء الطلب" });
}

/**
 * Reconciliation: re-query providers for attempts stuck in PENDING and flag the rest.
 * Results flow through the same idempotent `applyPaymentResult`.
 */
export async function reconcilePayments(olderThanMinutes = 15) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const stuck = await db.payment.findMany({ where: { status: "PENDING", createdAt: { lt: cutoff }, provider: { notIn: ["cod", "branch"] } }, take: 100 });
  const summary = { checked: stuck.length, updated: 0, unresolved: 0 };
  for (const p of stuck) {
    const provider = getProvider(p.provider);
    const status = provider && p.externalId ? await provider.fetchStatus(p.externalId).catch(() => null) : null;
    if (status && status.status !== "PENDING") {
      await applyPaymentResult(p.provider, { externalId: p.externalId!, paymentId: p.id, status: status.status, amount: status.amount, currency: p.currency });
      summary.updated++;
    } else {
      summary.unresolved++;
    }
  }
  return summary;
}

export async function listPayments(actor: StaffActor, filter: { status?: string; provider?: string; page?: number }) {
  assertCan(actor, "payments.read");
  const page = Math.max(filter.page ?? 1, 1);
  const where: Prisma.PaymentWhereInput = {
    ...(filter.status ? { status: filter.status as never } : {}),
    ...(filter.provider ? { provider: filter.provider } : {}),
    ...(actor.branchIds === "ALL" ? {} : { order: { fulfillmentBranchId: { in: [...actor.branchIds] } } }),
  };
  const [items, total] = await Promise.all([
    db.payment.findMany({ where, include: { order: { select: { number: true, id: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 40, take: 40 }),
    db.payment.count({ where }),
  ]);
  return { items, total, page, pageSize: 40 };
}

/** Used by the sandbox hosted page: builds and delivers a signed webhook to our own endpoint handler. */
export async function sandboxComplete(paymentId: string, outcome: "SUCCEEDED" | "FAILED") {
  if (!env.PAYMENT_SANDBOX_ENABLED) throw invalidState("بيئة الاختبار غير مفعلة");
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.provider !== "sandbox") throw notFound("عملية الدفع");
  const { SandboxProvider } = await import("./providers/sandbox");
  const body = JSON.stringify({
    id: `evt_${paymentId}_${outcome}`,
    type: "payment",
    externalId: payment.externalId,
    paymentId,
    status: outcome,
    amount: payment.amount,
    currency: payment.currency,
    failureReason: outcome === "FAILED" ? "card_declined" : undefined,
  });
  const headers = new Headers({ "x-sandbox-signature": SandboxProvider.sign(body) });
  return handleWebhook("sandbox", { headers, rawBody: body, query: new URLSearchParams() });
}
