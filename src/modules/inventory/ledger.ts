import "server-only";
import type { Tx } from "@/server/db";
import { DomainError } from "@/server/errors";
import type { MovementType } from "@/generated/prisma/enums";

export type MovementInput = {
  branchId: string;
  variantId: string;
  type: MovementType;
  /** Change to on-hand quantity (negative removes stock). */
  quantity: number;
  /** Change to reserved quantity. */
  reservedDelta?: number;
  unitCost?: number | null;
  reason?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  actorId?: string | null;
};

export type StockLevel = { onHand: number; reserved: number };

export class InsufficientStockError extends DomainError {
  constructor(public readonly variantId: string, public readonly branchId: string) {
    super("INSUFFICIENT_STOCK", "الكمية المطلوبة غير متوفرة في المخزون", { variantId, branchId });
  }
}

/**
 * The only way stock levels change. Applies a delta to the branch/variant projection with a single
 * conditional UPDATE (row-locked, so concurrent callers serialise and re-check the predicate) and
 * appends the matching ledger row with the resulting balances. Never overdraws on-hand or reserved.
 */
export async function applyMovement(tx: Tx, input: MovementInput): Promise<StockLevel> {
  const q = input.quantity;
  const r = input.reservedDelta ?? 0;
  if (!Number.isInteger(q) || !Number.isInteger(r)) throw new RangeError("Movement quantities must be integers");
  if (q === 0 && r === 0) throw new RangeError("Movement must change on-hand or reserved quantity");

  await tx.$executeRaw`
    INSERT INTO "inventory_item" ("id", "branchId", "variantId", "onHand", "reserved", "updatedAt")
    VALUES (${crypto.randomUUID()}, ${input.branchId}, ${input.variantId}, 0, 0, now())
    ON CONFLICT ("branchId", "variantId") DO NOTHING`;

  const rows = await tx.$queryRaw<StockLevel[]>`
    UPDATE "inventory_item"
       SET "onHand" = "onHand" + ${q}, "reserved" = "reserved" + ${r}, "updatedAt" = now()
     WHERE "branchId" = ${input.branchId} AND "variantId" = ${input.variantId}
       AND "onHand" + ${q} >= 0
       AND "reserved" + ${r} >= 0
       AND "reserved" + ${r} <= "onHand" + ${q}
     RETURNING "onHand", "reserved"`;

  const level = rows[0];
  if (!level) throw new InsufficientStockError(input.variantId, input.branchId);

  await tx.inventoryMovement.create({
    data: {
      branchId: input.branchId,
      variantId: input.variantId,
      type: input.type,
      quantity: q,
      reservedDelta: r,
      onHandAfter: level.onHand,
      reservedAfter: level.reserved,
      unitCost: input.unitCost ?? null,
      reason: input.reason ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      actorId: input.actorId ?? null,
    },
  });
  return level;
}

export type ReserveInput = {
  branchId: string;
  variantId: string;
  quantity: number;
  referenceType: string;
  referenceId: string;
  expiresAt?: Date | null;
  actorId?: string | null;
};

/** Reserve sellable stock (on-hand minus reserved) for an order or transfer. */
export async function reserveStock(tx: Tx, input: ReserveInput) {
  if (input.quantity <= 0) throw new RangeError("Reservation quantity must be positive");
  await applyMovement(tx, {
    branchId: input.branchId,
    variantId: input.variantId,
    type: "RESERVATION",
    quantity: 0,
    reservedDelta: input.quantity,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    actorId: input.actorId,
  });
  return tx.inventoryReservation.create({
    data: {
      branchId: input.branchId,
      variantId: input.variantId,
      quantity: input.quantity,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

async function lockActiveReservations(tx: Tx, referenceType: string, referenceId: string) {
  // Lock reservation rows so a concurrent release/consume cannot process them twice.
  const ids = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "inventory_reservation"
     WHERE "referenceType" = ${referenceType} AND "referenceId" = ${referenceId} AND "status" = 'ACTIVE'
     FOR UPDATE`;
  if (ids.length === 0) return [];
  return tx.inventoryReservation.findMany({ where: { id: { in: ids.map((r) => r.id) } } });
}

/** Release every active reservation for a reference (cancellation, payment failure, expiry). */
export async function releaseReservations(
  tx: Tx,
  referenceType: string,
  referenceId: string,
  opts: { reason?: string; actorId?: string | null } = {},
) {
  const reservations = await lockActiveReservations(tx, referenceType, referenceId);
  for (const res of reservations) {
    await applyMovement(tx, {
      branchId: res.branchId,
      variantId: res.variantId,
      type: "RESERVATION_RELEASE",
      quantity: 0,
      reservedDelta: -res.quantity,
      reason: opts.reason ?? null,
      referenceType,
      referenceId,
      actorId: opts.actorId,
    });
    await tx.inventoryReservation.update({ where: { id: res.id }, data: { status: "RELEASED" } });
  }
  return reservations.length;
}

/**
 * Convert active reservations into a stock deduction (sale handover, transfer dispatch).
 * Each reservation removes its quantity from both on-hand and reserved in one movement.
 */
export async function consumeReservations(
  tx: Tx,
  referenceType: string,
  referenceId: string,
  opts: { type: Extract<MovementType, "SALE" | "TRANSFER_OUT">; actorId?: string | null; unitCostByVariant?: Map<string, number> },
) {
  const reservations = await lockActiveReservations(tx, referenceType, referenceId);
  for (const res of reservations) {
    await applyMovement(tx, {
      branchId: res.branchId,
      variantId: res.variantId,
      type: opts.type,
      quantity: -res.quantity,
      reservedDelta: -res.quantity,
      unitCost: opts.unitCostByVariant?.get(res.variantId) ?? null,
      referenceType,
      referenceId,
      actorId: opts.actorId,
    });
    await tx.inventoryReservation.update({ where: { id: res.id }, data: { status: "CONSUMED" } });
  }
  return reservations;
}
