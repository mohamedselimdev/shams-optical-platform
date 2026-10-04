import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { nextNumber } from "@/server/counters";
import { type Actor, type StaffActor, actorId, assertCan, can, canAccessBranch } from "@/server/rbac/actor";
import { forbidden, invalid, invalidState, notFound } from "@/server/errors";
import type { TransferStatus } from "@/generated/prisma/enums";
import { applyMovement, releaseReservations, reserveStock } from "../inventory/ledger";

const REF = "transfer";

export const createTransferSchema = z.object({
  fromBranchId: z.string().min(1),
  toBranchId: z.string().min(1),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(10_000) }))
    .min(1, "أضف منتجاً واحداً على الأقل"),
});

/** Allowed transitions. Anything else is rejected. */
const TRANSITIONS: Record<TransferStatus, TransferStatus[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["RECEIVED"],
  RECEIVED: [],
  CANCELLED: [],
};

function assertTransition(from: TransferStatus, to: TransferStatus) {
  if (!TRANSITIONS[from].includes(to)) throw invalidState(`لا يمكن نقل التحويل من ${from} إلى ${to}`);
}

async function lockTransfer(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "stock_transfer" WHERE "id" = ${id} FOR UPDATE`;
  const transfer = await tx.stockTransfer.findUnique({ where: { id }, include: { items: true } });
  if (!transfer) throw notFound("التحويل");
  return transfer;
}

async function recordEvent(tx: Tx, actor: Actor, transferId: string, from: TransferStatus | null, to: TransferStatus, note?: string) {
  await tx.stockTransferEvent.create({
    data: { transferId, fromStatus: from, toStatus: to, actorId: actorId(actor) ?? "system", note: note ?? null },
  });
  await audit(tx, actor, { action: "transfer.status", entityType: "stock_transfer", entityId: transferId, before: { status: from }, after: { status: to }, metadata: note ? { note } : undefined });
}

export async function createTransfer(actor: StaffActor, input: z.input<typeof createTransferSchema>) {
  const data = createTransferSchema.parse(input);
  assertCan(actor, "transfers.create");
  if (data.fromBranchId === data.toBranchId) throw invalid("لا يمكن التحويل لنفس الفرع");
  if (!canAccessBranch(actor, data.fromBranchId) && !canAccessBranch(actor, data.toBranchId)) throw forbidden();

  const merged = new Map<string, number>();
  for (const i of data.items) merged.set(i.variantId, (merged.get(i.variantId) ?? 0) + i.quantity);

  return db.$transaction(async (tx) => {
    const variants = await tx.productVariant.count({ where: { id: { in: [...merged.keys()] } } });
    if (variants !== merged.size) throw invalid("بعض المنتجات غير موجودة");
    const number = await nextNumber(tx, "transfer", "TR");
    const transfer = await tx.stockTransfer.create({
      data: {
        number,
        fromBranchId: data.fromBranchId,
        toBranchId: data.toBranchId,
        notes: data.notes ?? null,
        createdById: actor.userId,
        items: { create: [...merged].map(([variantId, quantityRequested]) => ({ variantId, quantityRequested })) },
      },
    });
    await tx.stockTransferEvent.create({ data: { transferId: transfer.id, toStatus: "DRAFT", actorId: actor.userId } });
    await audit(tx, actor, { action: "transfer.create", entityType: "stock_transfer", entityId: transfer.id, after: { number, items: [...merged] } });
    return transfer;
  });
}

/** Approval reserves the requested stock at the source so it cannot be sold meanwhile. */
export async function approveTransfer(actor: Actor, id: string) {
  return db.$transaction(async (tx) => {
    const t = await lockTransfer(tx, id);
    assertCan(actor, "transfers.approve", t.fromBranchId);
    assertTransition(t.status, "APPROVED");
    for (const item of t.items) {
      await reserveStock(tx, { branchId: t.fromBranchId, variantId: item.variantId, quantity: item.quantityRequested, referenceType: REF, referenceId: t.id, actorId: actorId(actor) });
    }
    await tx.stockTransfer.update({ where: { id }, data: { status: "APPROVED", approvedById: actorId(actor), approvedAt: new Date() } });
    await recordEvent(tx, actor, id, t.status, "APPROVED");
  });
}

export const shipTransferSchema = z.object({
  items: z.array(z.object({ itemId: z.string(), quantityShipped: z.coerce.number().int().min(0) })).optional(),
  note: z.string().trim().max(500).optional(),
});

/** Dispatch: releases the reservation and removes the shipped quantity from the source (TRANSFER_OUT). */
export async function shipTransfer(actor: Actor, id: string, input: z.input<typeof shipTransferSchema> = {}) {
  const data = shipTransferSchema.parse(input);
  return db.$transaction(async (tx) => {
    const t = await lockTransfer(tx, id);
    assertCan(actor, "transfers.ship", t.fromBranchId);
    assertTransition(t.status, "IN_TRANSIT");
    const shipped = new Map(data.items?.map((i) => [i.itemId, i.quantityShipped]) ?? []);
    await releaseReservations(tx, REF, t.id, { reason: "transfer dispatch", actorId: actorId(actor) });
    let any = false;
    for (const item of t.items) {
      const qty = shipped.get(item.id) ?? item.quantityRequested;
      if (qty > item.quantityRequested) throw invalid("الكمية المشحونة أكبر من المطلوبة");
      if (qty > 0) {
        any = true;
        await applyMovement(tx, { branchId: t.fromBranchId, variantId: item.variantId, type: "TRANSFER_OUT", quantity: -qty, referenceType: REF, referenceId: t.id, actorId: actorId(actor) });
      }
      await tx.stockTransferItem.update({ where: { id: item.id }, data: { quantityShipped: qty } });
    }
    if (!any) throw invalid("لا توجد كميات للشحن");
    await tx.stockTransfer.update({ where: { id }, data: { status: "IN_TRANSIT", shippedById: actorId(actor), shippedAt: new Date() } });
    await recordEvent(tx, actor, id, t.status, "IN_TRANSIT", data.note);
  });
}

export const receiveTransferSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string(),
      quantityReceived: z.coerce.number().int().min(0),
      discrepancyReason: z.string().trim().max(300).optional(),
    }),
  ),
  note: z.string().trim().max(500).optional(),
});

/** Receipt adds received quantities at the destination (TRANSFER_IN); shortfalls require a reason. */
export async function receiveTransfer(actor: Actor, id: string, input: z.input<typeof receiveTransferSchema>) {
  const data = receiveTransferSchema.parse(input);
  return db.$transaction(async (tx) => {
    const t = await lockTransfer(tx, id);
    assertCan(actor, "transfers.receive", t.toBranchId);
    assertTransition(t.status, "RECEIVED");
    const received = new Map(data.items.map((i) => [i.itemId, i]));
    const discrepancies: { variantId: string; shipped: number; received: number; reason: string }[] = [];
    for (const item of t.items) {
      const line = received.get(item.id);
      const qty = line?.quantityReceived ?? item.quantityShipped;
      if (qty > item.quantityShipped) throw invalid("الكمية المستلمة أكبر من المشحونة");
      const reason = line?.discrepancyReason?.trim() || null;
      if (qty < item.quantityShipped && !reason) throw invalid("يجب ذكر سبب الفرق في الكميات المستلمة");
      if (qty > 0) {
        await applyMovement(tx, { branchId: t.toBranchId, variantId: item.variantId, type: "TRANSFER_IN", quantity: qty, referenceType: REF, referenceId: t.id, actorId: actorId(actor) });
      }
      await tx.stockTransferItem.update({ where: { id: item.id }, data: { quantityReceived: qty, discrepancyReason: reason } });
      if (qty < item.quantityShipped) discrepancies.push({ variantId: item.variantId, shipped: item.quantityShipped, received: qty, reason: reason! });
    }
    await tx.stockTransfer.update({ where: { id }, data: { status: "RECEIVED", receivedById: actorId(actor), receivedAt: new Date() } });
    await recordEvent(tx, actor, id, t.status, "RECEIVED", discrepancies.length ? `فروقات: ${discrepancies.length}` : data.note);
    return { discrepancies };
  });
}

export async function cancelTransfer(actor: Actor, id: string, reason: string) {
  return db.$transaction(async (tx) => {
    const t = await lockTransfer(tx, id);
    if (!can(actor, "transfers.approve", t.fromBranchId) && !(can(actor, "transfers.create") && t.status === "DRAFT")) throw forbidden();
    assertTransition(t.status, "CANCELLED");
    await releaseReservations(tx, REF, t.id, { reason: "transfer cancelled", actorId: actorId(actor) });
    await tx.stockTransfer.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await recordEvent(tx, actor, id, t.status, "CANCELLED", reason);
  });
}

export async function listTransfers(actor: StaffActor, filter: { status?: TransferStatus; page?: number }) {
  assertCan(actor, "inventory.read");
  const page = Math.max(filter.page ?? 1, 1);
  const where = {
    ...(filter.status ? { status: filter.status } : {}),
    ...(actor.branchIds === "ALL" ? {} : { OR: [{ fromBranchId: { in: [...actor.branchIds] } }, { toBranchId: { in: [...actor.branchIds] } }] }),
  };
  const [items, total] = await Promise.all([
    db.stockTransfer.findMany({
      where,
      include: { fromBranch: { select: { name: true } }, toBranch: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 30,
      take: 30,
    }),
    db.stockTransfer.count({ where }),
  ]);
  return { items, total, page, pageSize: 30 };
}

export async function getTransfer(actor: StaffActor, id: string) {
  assertCan(actor, "inventory.read");
  const t = await db.stockTransfer.findUnique({
    where: { id },
    include: {
      fromBranch: true,
      toBranch: true,
      items: { include: { variant: { select: { sku: true, colorName: true, sizeLabel: true, product: { select: { name: true } } } } } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!t) throw notFound("التحويل");
  if (!canAccessBranch(actor, t.fromBranchId) && !canAccessBranch(actor, t.toBranchId)) throw forbidden();
  return t;
}
