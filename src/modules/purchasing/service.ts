import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { nextNumber } from "@/server/counters";
import { type Actor, type StaffActor, actorId, assertCan, branchScope } from "@/server/rbac/actor";
import { invalid, invalidState, notFound } from "@/server/errors";
import { zEgp } from "@/lib/validation";
import type { PurchaseOrderStatus } from "@/generated/prisma/enums";
import { applyMovement } from "../inventory/ledger";

const REF = "purchase_order";

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "اختر المورد"),
  branchId: z.string().min(1, "اختر فرع الاستلام"),
  expectedAt: z.union([z.literal(""), z.coerce.date()]).optional().transform((v) => (v ? v : null)),
  notes: z.string().trim().max(1000).optional().transform((v) => v || null),
  items: z
    .array(z.object({ variantId: z.string().min(1), quantity: z.coerce.number().int().min(1).max(100_000), unitCost: zEgp }))
    .min(1, "أضف بنداً واحداً على الأقل"),
});

async function lockPo(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "purchase_order" WHERE "id" = ${id} FOR UPDATE`;
  const po = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
  if (!po) throw notFound("أمر الشراء");
  return po;
}

export async function createPurchaseOrder(actor: Actor, input: z.input<typeof purchaseOrderSchema>) {
  const data = purchaseOrderSchema.parse(input);
  assertCan(actor, "purchasing.write", data.branchId);
  const merged = new Map<string, { quantity: number; unitCost: number }>();
  for (const i of data.items) {
    const prev = merged.get(i.variantId);
    if (prev && prev.unitCost !== i.unitCost) throw invalid("نفس المنتج مكرر بتكلفة مختلفة");
    merged.set(i.variantId, { quantity: (prev?.quantity ?? 0) + i.quantity, unitCost: i.unitCost });
  }
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.findUnique({ where: { id: data.supplierId } });
    if (!supplier || !supplier.isActive) throw invalid("المورد غير متاح");
    const number = await nextNumber(tx, "po", "PO");
    const subtotal = [...merged.values()].reduce((s, i) => s + i.quantity * i.unitCost, 0);
    const po = await tx.purchaseOrder.create({
      data: {
        number,
        supplierId: data.supplierId,
        branchId: data.branchId,
        expectedAt: data.expectedAt,
        notes: data.notes,
        subtotal,
        createdById: actorId(actor) ?? "system",
        items: { create: [...merged].map(([variantId, v]) => ({ variantId, quantityOrdered: v.quantity, unitCost: v.unitCost })) },
      },
    });
    await audit(tx, actor, { action: "purchase_order.create", entityType: "purchase_order", entityId: po.id, branchId: data.branchId, after: { number, subtotal } });
    return po;
  });
}

export async function sendPurchaseOrder(actor: Actor, id: string) {
  return db.$transaction(async (tx) => {
    const po = await lockPo(tx, id);
    assertCan(actor, "purchasing.write", po.branchId);
    if (po.status !== "DRAFT") throw invalidState("يمكن إرسال أوامر الشراء المسودة فقط");
    await tx.purchaseOrder.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
    await audit(tx, actor, { action: "purchase_order.status", entityType: "purchase_order", entityId: id, before: { status: po.status }, after: { status: "SENT" } });
  });
}

export async function cancelPurchaseOrder(actor: Actor, id: string, reason: string) {
  return db.$transaction(async (tx) => {
    const po = await lockPo(tx, id);
    assertCan(actor, "purchasing.write", po.branchId);
    if (!["DRAFT", "SENT"].includes(po.status)) throw invalidState("لا يمكن إلغاء أمر شراء تم استلام جزء منه");
    await tx.purchaseOrder.update({ where: { id }, data: { status: "CANCELLED", closedAt: new Date() } });
    await audit(tx, actor, { action: "purchase_order.status", entityType: "purchase_order", entityId: id, before: { status: po.status }, after: { status: "CANCELLED" }, metadata: { reason } });
  });
}

export const receiveSchema = z.object({
  items: z.array(z.object({ poItemId: z.string(), quantity: z.coerce.number().int().min(0) })),
  notes: z.string().trim().max(500).optional(),
});

/**
 * Goods receipt: creates a GoodsReceipt document and one PURCHASE_RECEIPT movement per line,
 * updates the variant's moving-average cost, and advances the PO status.
 */
export async function receivePurchaseOrder(actor: Actor, id: string, input: z.input<typeof receiveSchema>) {
  const data = receiveSchema.parse(input);
  return db.$transaction(async (tx) => {
    const po = await lockPo(tx, id);
    assertCan(actor, "purchasing.receive", po.branchId);
    if (!["SENT", "PARTIALLY_RECEIVED"].includes(po.status)) throw invalidState("أمر الشراء غير جاهز للاستلام");
    const lines = data.items.filter((i) => i.quantity > 0);
    if (lines.length === 0) throw invalid("أدخل كمية مستلمة واحدة على الأقل");

    const receipt = await tx.goodsReceipt.create({
      data: { purchaseOrderId: po.id, branchId: po.branchId, receivedById: actorId(actor) ?? "system", notes: data.notes ?? null },
    });

    for (const line of lines) {
      const item = po.items.find((i) => i.id === line.poItemId);
      if (!item) throw invalid("بند غير موجود في أمر الشراء");
      const outstanding = item.quantityOrdered - item.quantityReceived;
      if (line.quantity > outstanding) throw invalid(`الكمية المستلمة تتجاوز المتبقي (${outstanding})`);

      await updateMovingAverageCost(tx, item.variantId, line.quantity, item.unitCost);
      await applyMovement(tx, {
        branchId: po.branchId,
        variantId: item.variantId,
        type: "PURCHASE_RECEIPT",
        quantity: line.quantity,
        unitCost: item.unitCost,
        referenceType: REF,
        referenceId: po.id,
        actorId: actorId(actor),
      });
      await tx.goodsReceiptItem.create({ data: { receiptId: receipt.id, poItemId: item.id, quantity: line.quantity, unitCost: item.unitCost } });
      await tx.purchaseOrderItem.update({ where: { id: item.id }, data: { quantityReceived: { increment: line.quantity } } });
    }

    const items = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: po.id } });
    const complete = items.every((i) => i.quantityReceived >= i.quantityOrdered);
    const status: PurchaseOrderStatus = complete ? "RECEIVED" : "PARTIALLY_RECEIVED";
    await tx.purchaseOrder.update({ where: { id }, data: { status, closedAt: complete ? new Date() : null } });
    await audit(tx, actor, {
      action: "purchase_order.receive",
      entityType: "purchase_order",
      entityId: id,
      branchId: po.branchId,
      before: { status: po.status },
      after: { status },
      metadata: { receiptId: receipt.id, lines },
    });
    return { receiptId: receipt.id, status };
  });
}

/** Weighted average cost across all branches, computed before the receipt is applied. */
async function updateMovingAverageCost(tx: Tx, variantId: string, qty: number, unitCost: number) {
  await tx.$queryRaw`SELECT "id" FROM "product_variant" WHERE "id" = ${variantId} FOR UPDATE`;
  const variant = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId }, select: { costPrice: true } });
  const agg = await tx.inventoryItem.aggregate({ where: { variantId }, _sum: { onHand: true } });
  const onHand = Math.max(0, agg._sum.onHand ?? 0);
  const newCost = onHand + qty === 0 ? unitCost : Math.round((onHand * variant.costPrice + qty * unitCost) / (onHand + qty));
  if (newCost !== variant.costPrice) {
    await tx.productVariant.update({ where: { id: variantId }, data: { costPrice: newCost } });
    await tx.priceChange.create({ data: { variantId, field: "costPrice", oldValue: variant.costPrice, newValue: newCost, actorId: null } });
  }
}

export async function listPurchaseOrders(actor: StaffActor, filter: { status?: PurchaseOrderStatus; page?: number }) {
  assertCan(actor, "purchasing.read");
  const page = Math.max(filter.page ?? 1, 1);
  const where = { ...branchScope(actor), ...(filter.status ? { status: filter.status } : {}) };
  const [items, total] = await Promise.all([
    db.purchaseOrder.findMany({
      where,
      include: { supplier: { select: { name: true } }, branch: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 30,
      take: 30,
    }),
    db.purchaseOrder.count({ where }),
  ]);
  return { items, total, page, pageSize: 30 };
}

export async function getPurchaseOrder(actor: StaffActor, id: string) {
  assertCan(actor, "purchasing.read");
  const po = await db.purchaseOrder.findFirst({
    where: { id, ...branchScope(actor) },
    include: {
      supplier: true,
      branch: true,
      items: { include: { variant: { select: { sku: true, colorName: true, sizeLabel: true, product: { select: { name: true } } } } } },
      receipts: { include: { items: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!po) throw notFound("أمر الشراء");
  return po;
}
