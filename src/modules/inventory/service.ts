import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, actorId, assertCan, branchScope } from "@/server/rbac/actor";
import { invalid, notFound } from "@/server/errors";
import { applyMovement } from "./ledger";

export const adjustmentSchema = z.object({
  branchId: z.string().min(1),
  variantId: z.string().min(1),
  mode: z.enum(["delta", "count"]),
  /** For "delta": signed change. For "count": the physically counted quantity. */
  value: z.coerce.number().int().min(-100_000).max(100_000),
  type: z.enum(["ADJUSTMENT", "DAMAGE", "OPENING_BALANCE"]).default("ADJUSTMENT"),
  reason: z.string().trim().min(3, "سبب التسوية مطلوب").max(300),
});

/**
 * Manual stock adjustment (cycle count, damage write-off, opening balance). Always produces
 * a ledger movement + audit entry; the projection is never edited directly.
 */
export async function adjustStock(actor: Actor, input: z.input<typeof adjustmentSchema>) {
  const data = adjustmentSchema.parse(input);
  assertCan(actor, "inventory.adjust", data.branchId);

  return db.$transaction(async (tx) => {
    const variant = await tx.productVariant.findUnique({ where: { id: data.variantId }, select: { id: true, sku: true, costPrice: true } });
    if (!variant) throw notFound("المنتج");
    const branch = await tx.branch.findUnique({ where: { id: data.branchId }, select: { id: true } });
    if (!branch) throw notFound("الفرع");

    // Lock the projection row so a count-based delta is computed against a stable value.
    const current = await tx.$queryRaw<{ onHand: number; reserved: number }[]>`
      SELECT "onHand", "reserved" FROM "inventory_item"
       WHERE "branchId" = ${data.branchId} AND "variantId" = ${data.variantId} FOR UPDATE`;
    const before = current[0] ?? { onHand: 0, reserved: 0 };

    let delta = data.mode === "delta" ? data.value : data.value - before.onHand;
    if (data.type === "DAMAGE") {
      if (data.mode !== "delta" || data.value <= 0) throw invalid("كمية التالف يجب أن تكون رقماً موجباً");
      delta = -data.value;
    }
    if (delta === 0) throw invalid("لا يوجد تغيير في الكمية");
    if (before.onHand + delta < before.reserved) {
      throw invalid(`لا يمكن خفض المخزون أقل من الكمية المحجوزة (${before.reserved})`);
    }

    const after = await applyMovement(tx, {
      branchId: data.branchId,
      variantId: data.variantId,
      type: data.type,
      quantity: delta,
      unitCost: variant.costPrice,
      reason: data.reason,
      referenceType: "adjustment",
      actorId: actorId(actor),
    });

    await audit(tx, actor, {
      action: data.type === "DAMAGE" ? "inventory.damage" : "inventory.adjust",
      entityType: "inventory_item",
      entityId: `${data.branchId}:${data.variantId}`,
      branchId: data.branchId,
      before,
      after,
      metadata: { sku: variant.sku, delta, reason: data.reason, mode: data.mode },
    });
    return after;
  });
}

export type StockFilter = {
  branchId?: string;
  q?: string;
  status?: "low" | "out" | "all";
  page?: number;
  pageSize?: number;
};

export async function listStock(actor: Actor, filter: StockFilter) {
  assertCan(actor, "inventory.read", filter.branchId);
  const pageSize = Math.min(filter.pageSize ?? 50, 200);
  const page = Math.max(filter.page ?? 1, 1);
  const where = {
    ...branchScope(actor),
    ...(filter.branchId ? { branchId: filter.branchId } : {}),
    ...(filter.q
      ? {
          variant: {
            OR: [
              { sku: { contains: filter.q, mode: "insensitive" as const } },
              { barcode: { contains: filter.q } },
              { product: { name: { contains: filter.q, mode: "insensitive" as const } } },
            ],
          },
        }
      : {}),
    ...(filter.status === "out" ? { onHand: 0 } : {}),
  };
  const [rows, total] = await Promise.all([
    db.inventoryItem.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, code: true } },
        variant: { select: { id: true, sku: true, colorName: true, sizeLabel: true, costPrice: true, price: true, product: { select: { id: true, name: true } } } },
      },
      orderBy: [{ branch: { sortOrder: "asc" } }, { variant: { sku: "asc" } }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.inventoryItem.count({ where }),
  ]);
  const items = rows
    .map((r) => ({ ...r, available: r.onHand - r.reserved }))
    .filter((r) => (filter.status === "low" ? r.available <= Math.max(r.reorderPoint, 0) : true));
  return { items, total, page, pageSize };
}

export async function listMovements(actor: Actor, filter: { branchId?: string; variantId?: string; type?: string; page?: number }) {
  assertCan(actor, "inventory.read", filter.branchId);
  const pageSize = 50;
  const page = Math.max(filter.page ?? 1, 1);
  const where = {
    ...branchScope(actor),
    ...(filter.branchId ? { branchId: filter.branchId } : {}),
    ...(filter.variantId ? { variantId: filter.variantId } : {}),
    ...(filter.type ? { type: filter.type as never } : {}),
  };
  const [items, total] = await Promise.all([
    db.inventoryMovement.findMany({
      where,
      include: {
        branch: { select: { name: true, code: true } },
        variant: { select: { sku: true, product: { select: { name: true } } } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.inventoryMovement.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

/** Sellable quantity per variant (optionally limited to branches). */
export async function availableByVariant(variantIds: string[], branchIds?: string[]) {
  if (variantIds.length === 0) return new Map<string, number>();
  const rows = await db.inventoryItem.groupBy({
    by: ["variantId"],
    where: { variantId: { in: variantIds }, ...(branchIds ? { branchId: { in: branchIds } } : {}), branch: { isActive: true } },
    _sum: { onHand: true, reserved: true },
  });
  return new Map(rows.map((r) => [r.variantId, (r._sum.onHand ?? 0) - (r._sum.reserved ?? 0)]));
}

export async function availabilityByBranch(variantId: string) {
  const rows = await db.inventoryItem.findMany({
    where: { variantId, branch: { isActive: true } },
    select: { onHand: true, reserved: true, branch: { select: { id: true, name: true, slug: true, city: true, pickupEnabled: true, type: true } } },
  });
  return rows.map((r) => ({ branch: r.branch, available: Math.max(0, r.onHand - r.reserved) }));
}
