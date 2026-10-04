import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { nextNumber } from "@/server/counters";
import { getSetting } from "@/server/settings";
import { type Actor, type StaffActor, actorId, assertCan, branchScope } from "@/server/rbac/actor";
import { forbidden, invalid, invalidState, notFound } from "@/server/errors";
import { allocate, toEgpString } from "@/lib/money";
import type { ReturnStatus } from "@/generated/prisma/enums";
import { applyMovement } from "../inventory/ledger";
import { postLoyalty } from "../loyalty/service";
import { refundPayment } from "../payments/service";
import { applyTransition, lockOrder } from "../orders/service";

const REF = "return";

const TRANSITIONS: Record<ReturnStatus, ReturnStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["RECEIVED", "CANCELLED"],
  RECEIVED: ["INSPECTED"],
  INSPECTED: ["COMPLETED"],
  REJECTED: [],
  COMPLETED: [],
  CANCELLED: [],
};

export const createReturnSchema = z.object({
  orderId: z.string().min(1),
  reason: z.string().trim().min(3, "اذكر سبب الإرجاع").max(500),
  resolution: z.enum(["REFUND", "EXCHANGE"]).default("REFUND"),
  customerNote: z.string().trim().max(1000).optional(),
  items: z.array(z.object({ orderItemId: z.string(), quantity: z.coerce.number().int().min(0), reason: z.string().trim().max(200).optional() })),
});

/** Quantity of an order item still eligible for return (excludes already returned and open requests). */
async function openReturnQty(tx: Tx, orderItemId: string) {
  const agg = await tx.returnItem.aggregate({
    where: { orderItemId, returnRequest: { status: { in: ["REQUESTED", "APPROVED", "RECEIVED", "INSPECTED"] } } },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

export async function createReturn(actor: Actor, input: z.input<typeof createReturnSchema>) {
  const data = createReturnSchema.parse(input);
  const lines = data.items.filter((i) => i.quantity > 0);
  if (!lines.length) throw invalid("اختر منتجاً واحداً على الأقل للإرجاع");
  const policy = await getSetting("returns");

  return db.$transaction(async (tx) => {
    const order = await lockOrder(tx, data.orderId);
    if (actor.kind === "customer") {
      const customer = await tx.customer.findUnique({ where: { userId: actor.userId } });
      if (!customer || order.customerId !== customer.id) throw notFound("الطلب");
      if (!policy.allowCustomerRequests) throw forbidden("طلبات الإرجاع الإلكترونية متوقفة حالياً");
    } else {
      assertCan(actor, "returns.manage", order.fulfillmentBranchId);
    }
    if (order.status !== "DELIVERED") throw invalidState("يمكن إرجاع الطلبات المسلّمة فقط");
    const deliveredAt = order.completedAt ?? order.updatedAt;
    const ageDays = (Date.now() - deliveredAt.getTime()) / 86_400_000;
    if (actor.kind === "customer" && ageDays > policy.windowDays) throw invalidState(`انتهت مدة الإرجاع (${policy.windowDays} يوماً)`);

    for (const line of lines) {
      const item = order.items.find((i) => i.id === line.orderItemId);
      if (!item) throw invalid("منتج غير موجود في الطلب");
      if (!item.returnable && !policy.allowPrescriptionLensReturns) throw invalid(`${item.productName}: العدسات الطبية المصنّعة حسب الطلب غير قابلة للإرجاع`);
      const remaining = item.quantity - item.returnedQuantity - (await openReturnQty(tx, item.id));
      if (line.quantity > remaining) throw invalid(`${item.productName}: الكمية المتاحة للإرجاع ${remaining}`);
    }

    const number = await nextNumber(tx, "return", "RT");
    const ret = await tx.returnRequest.create({
      data: {
        number,
        orderId: order.id,
        customerId: order.customerId,
        branchId: order.fulfillmentBranchId,
        resolution: data.resolution,
        reason: data.reason,
        customerNote: data.customerNote ?? null,
        createdById: actorId(actor),
        items: { create: lines.map((l) => ({ orderItemId: l.orderItemId, quantity: l.quantity, reason: l.reason ?? null })) },
        events: { create: { toStatus: "REQUESTED", actorId: actorId(actor) } },
      },
    });
    await tx.orderEvent.create({ data: { orderId: order.id, type: "NOTE", message: `طلب إرجاع ${number}`, isPublic: true, actorId: actorId(actor) } });
    return ret;
  });
}

async function lockReturn(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "return_request" WHERE "id" = ${id} FOR UPDATE`;
  const r = await tx.returnRequest.findUnique({ where: { id }, include: { items: { include: { orderItem: true } }, order: true } });
  if (!r) throw notFound("طلب الإرجاع");
  return r;
}

async function move(tx: Tx, actor: Actor, id: string, from: ReturnStatus, to: ReturnStatus, note?: string | null) {
  if (!TRANSITIONS[from].includes(to)) throw invalidState("انتقال غير مسموح لحالة الإرجاع");
  await tx.returnRequest.update({ where: { id }, data: { status: to, ...(note ? { staffNote: note } : {}) } });
  await tx.returnEvent.create({ data: { returnId: id, fromStatus: from, toStatus: to, actorId: actorId(actor), note: note ?? null } });
  await audit(tx, actor, { action: "return.status", entityType: "return_request", entityId: id, before: { status: from }, after: { status: to }, metadata: note ? { note } : undefined });
}

export async function reviewReturn(actor: StaffActor, id: string, decision: "APPROVED" | "REJECTED", note?: string) {
  return db.$transaction(async (tx) => {
    const r = await lockReturn(tx, id);
    assertCan(actor, "returns.manage", r.order.fulfillmentBranchId);
    if (decision === "REJECTED" && !note) throw invalid("اذكر سبب الرفض");
    await move(tx, actor, id, r.status, decision, note);
  });
}

export async function receiveReturn(actor: StaffActor, id: string, branchId: string) {
  return db.$transaction(async (tx) => {
    const r = await lockReturn(tx, id);
    assertCan(actor, "returns.manage", branchId);
    await tx.returnRequest.update({ where: { id }, data: { branchId } });
    await move(tx, actor, id, r.status, "RECEIVED");
  });
}

export const inspectSchema = z.object({
  items: z.array(z.object({ returnItemId: z.string(), condition: z.string().trim().max(200).optional(), restockDecision: z.enum(["RESTOCK", "DAMAGED", "DISCARD"]) })),
  note: z.string().trim().max(500).optional(),
});

/**
 * Inspection records the condition of each item. Every returned unit re-enters the ledger
 * (RETURN_RESTOCK); damaged/discarded units are then written off with a DAMAGE movement,
 * so the physical journey of each unit stays traceable.
 */
export async function inspectReturn(actor: StaffActor, id: string, input: z.input<typeof inspectSchema>) {
  const data = inspectSchema.parse(input);
  return db.$transaction(async (tx) => {
    const r = await lockReturn(tx, id);
    const branchId = r.branchId ?? r.order.fulfillmentBranchId;
    assertCan(actor, "returns.manage", branchId);
    if (r.status !== "RECEIVED") throw invalidState("يجب استلام المرتجع قبل الفحص");
    for (const item of r.items) {
      const decision = data.items.find((d) => d.returnItemId === item.id);
      if (!decision) throw invalid("حدد قرار الفحص لكل منتج");
      await applyMovement(tx, { branchId, variantId: item.orderItem.variantId, type: "RETURN_RESTOCK", quantity: item.quantity, unitCost: item.orderItem.unitCost, referenceType: REF, referenceId: r.id, actorId: actor.userId, reason: decision.condition ?? null });
      if (decision.restockDecision !== "RESTOCK") {
        await applyMovement(tx, { branchId, variantId: item.orderItem.variantId, type: "DAMAGE", quantity: -item.quantity, unitCost: item.orderItem.unitCost, referenceType: REF, referenceId: r.id, actorId: actor.userId, reason: decision.restockDecision === "DAMAGED" ? "مرتجع تالف" : "مرتجع للإتلاف" });
      }
      await tx.returnItem.update({ where: { id: item.id }, data: { restockDecision: decision.restockDecision, condition: decision.condition ?? null } });
      await tx.orderItem.update({ where: { id: item.orderItemId }, data: { returnedQuantity: { increment: item.quantity } } });
    }
    await move(tx, actor, id, r.status, "INSPECTED", data.note);
  });
}

/** Refund amount for the returned units: their share of each line's charged total. */
export function computeReturnRefund(items: { quantity: number; orderItem: { quantity: number; lineTotal: number } }[]) {
  return items.reduce((sum, i) => {
    const parts = allocate(i.orderItem.lineTotal, Array.from({ length: i.orderItem.quantity }, () => 1));
    return sum + parts.slice(0, i.quantity).reduce((a, b) => a + b, 0);
  }, 0);
}

export async function completeReturn(actor: StaffActor, id: string) {
  const r = await db.returnRequest.findUnique({ where: { id }, include: { items: { include: { orderItem: true } }, order: true } });
  if (!r) throw notFound("طلب الإرجاع");
  assertCan(actor, "returns.manage", r.order.fulfillmentBranchId);
  if (r.status !== "INSPECTED") throw invalidState("يجب فحص المرتجع قبل الإتمام");

  let refundAmount = 0;
  if (r.resolution === "REFUND") {
    refundAmount = Math.min(computeReturnRefund(r.items), r.order.paidTotal - r.order.refundedTotal);
    let left = refundAmount;
    const payments = await db.payment.findMany({ where: { orderId: r.orderId, status: "SUCCEEDED" }, orderBy: { createdAt: "asc" } });
    for (const p of payments) {
      if (left <= 0) break;
      const avail = p.amount - p.refundedAmount;
      const amount = Math.min(avail, left);
      if (amount <= 0) continue;
      assertCan(actor, "payments.refund", r.order.fulfillmentBranchId);
      const refund = await refundPayment(actor, { paymentId: p.id, amount: toEgpString(amount), reason: `مرتجع ${r.number}`, returnId: r.id });
      if (refund.status !== "SUCCEEDED") throw invalidState("فشل تنفيذ الاسترداد؛ لم يتم إتمام المرتجع");
      left -= amount;
    }
  }

  await db.$transaction(async (tx) => {
    const fresh = await lockReturn(tx, id);
    if (fresh.status !== "INSPECTED") return;
    await tx.returnRequest.update({ where: { id }, data: { refundAmount } });
    await move(tx, actor, id, fresh.status, "COMPLETED");
    const order = await lockOrder(tx, r.orderId);
    // Proportionally reverse loyalty points earned on the refunded amount.
    if (order.customerId && refundAmount > 0) {
      const earned = await tx.loyaltyTransaction.aggregate({ where: { orderId: order.id, type: "EARN" }, _sum: { points: true } });
      const points = Math.floor(((earned._sum.points ?? 0) * refundAmount) / Math.max(order.total, 1));
      const acc = await tx.loyaltyAccount.findUnique({ where: { customerId: order.customerId } });
      const clamp = Math.min(points, acc?.balance ?? 0);
      if (clamp > 0) await postLoyalty(tx, { customerId: order.customerId, type: "REVERSAL", points: -clamp, orderId: order.id, reason: `reverse:EARN مرتجع ${r.number}` });
    }
    const allReturned = order.items.every((i) => i.returnedQuantity >= i.quantity);
    if (allReturned && order.status === "DELIVERED") await applyTransition(tx, actor, order, "RETURNED", { note: `مرتجع ${r.number}` });
  });
}

export async function listReturns(actor: StaffActor, filter: { status?: ReturnStatus; page?: number }) {
  assertCan(actor, "returns.read");
  const page = Math.max(filter.page ?? 1, 1);
  const where = { ...(filter.status ? { status: filter.status } : {}), ...branchScope(actor) };
  const [items, total] = await Promise.all([
    db.returnRequest.findMany({ where, include: { order: { select: { number: true } }, customer: { select: { firstName: true, lastName: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30 }),
    db.returnRequest.count({ where }),
  ]);
  return { items, total, page, pageSize: 30 };
}

export async function getReturnForStaff(actor: StaffActor, id: string) {
  assertCan(actor, "returns.read");
  const r = await db.returnRequest.findFirst({
    where: { id, ...branchScope(actor) },
    include: {
      order: { select: { id: true, number: true, fulfillmentBranchId: true, paidTotal: true, refundedTotal: true } },
      customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
      branch: { select: { name: true } },
      items: { include: { orderItem: { select: { productName: true, sku: true, quantity: true, lineTotal: true, variantName: true } } } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!r) throw notFound("طلب الإرجاع");
  return { ...r, estimatedRefund: Math.min(computeReturnRefund(r.items), r.order.paidTotal - r.order.refundedTotal) };
}
