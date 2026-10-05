import "server-only";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { emailTransport } from "@/server/notifications/email";
import { logger } from "@/server/logger";
import type { JobHandler, JobType } from "@/server/jobs/queue";
import { getSetting } from "@/server/settings";
import { ORDER_STATUS_LABELS } from "@/i18n/labels";
import { isLocale } from "@/i18n/config";
import { translatorFor } from "@/i18n/server";
import { expirePendingOrders } from "../orders/service";
import { reconcilePayments, refundOrphanPayment } from "../payments/service";
import { markAbandonedCarts } from "../analytics/service";
import type { OrderStatus } from "@/generated/prisma/enums";

/**
 * Background job handlers. Customer messages are stored in `notification` (without secrets) so staff
 * can audit what was sent. SMS is not integrated yet (recorded as SKIPPED); email uses the configured transport.
 */
async function notifyOrderStatus(payload: Record<string, unknown>) {
  const order = await db.order.findUnique({ where: { id: String(payload.orderId) }, select: { id: true, number: true, contactName: true, contactEmail: true, contactPhone: true, customerId: true, total: true, locale: true } });
  if (!order) return;
  const status = payload.status as OrderStatus;
  // Customer messages use the language the order was placed in.
  const t = translatorFor(isLocale(order.locale) ? order.locale : "ar");
  const statusLabel = t(ORDER_STATUS_LABELS[status]);
  const subject = t("طلبك {0}: {1}", [order.number, statusLabel]);
  const body = t("مرحباً {0}،\n\nتم تحديث حالة طلبك رقم {1} إلى: {2}.\nإجمالي الطلب: {3}\n\nيمكنك متابعة الطلب من: {4}/track?order={5}\n\nشكراً لاختيارك شمس.", [order.contactName, order.number, statusLabel, t.money(order.total), env.APP_URL, encodeURIComponent(order.number)]);

  if (order.contactEmail) {
    const transport = emailTransport();
    const n = await db.notification.create({ data: { channel: "EMAIL", recipient: order.contactEmail, customerId: order.customerId, template: "order_status", subject, body, data: { orderId: order.id, status } } });
    try {
      await transport.send({ to: order.contactEmail, subject, text: body });
      await db.notification.update({ where: { id: n.id }, data: { status: "SENT", sentAt: new Date() } });
    } catch (err) {
      await db.notification.update({ where: { id: n.id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "error" } });
      throw err;
    }
  }
  // No SMS/WhatsApp adapter is implemented yet: record the intent so staff can see what would be sent.
  await db.notification.create({ data: { channel: "SMS", recipient: order.contactPhone, customerId: order.customerId, template: "order_status", body: subject, status: "SKIPPED", error: "SMS provider not integrated", data: { orderId: order.id, status } } });
  // In-app notification for staff dashboards on new paid/processing orders.
  if (status === "PAID" || status === "PRESCRIPTION_REVIEW") {
    const staff = await db.staffProfile.findMany({ where: { isActive: true, roles: { some: { role: { permissions: { some: { permission: "orders.update" } } } } } }, select: { userId: true } });
    if (staff.length) {
      await db.notification.createMany({ data: staff.map((s) => ({ channel: "IN_APP" as const, recipient: s.userId, staffUserId: s.userId, template: "order_attention", subject: `طلب ${order.number} يحتاج متابعة`, body: ORDER_STATUS_LABELS[status], data: { orderId: order.id } })) });
    }
  }
}

export const jobHandlers: Partial<Record<JobType, JobHandler>> = {
  "notify.order_status": notifyOrderStatus,
  "orders.expire_pending": async () => {
    const n = await expirePendingOrders();
    if (n) logger.info({ expired: n }, "expired pending orders");
  },
  "payments.reconcile": async () => {
    const s = await reconcilePayments();
    logger.info(s, "payment reconciliation");
  },
  "payments.refund_orphan": async (p) => refundOrphanPayment(String(p.paymentId)),
  "carts.mark_abandoned": async () => {
    const settings = await getSetting("analytics");
    const n = await markAbandonedCarts(settings.abandonedCartMinutes);
    if (n) logger.info({ abandoned: n }, "carts marked abandoned");
  },
};

/** Periodic maintenance enqueued by the worker loop. */
export const SCHEDULE: { type: JobType; everyMinutes: number }[] = [
  { type: "orders.expire_pending", everyMinutes: 5 },
  { type: "payments.reconcile", everyMinutes: 15 },
  { type: "carts.mark_abandoned", everyMinutes: 30 },
];
