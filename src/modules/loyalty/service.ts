import "server-only";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, actorId, assertCan } from "@/server/rbac/actor";
import { DomainError, invalid } from "@/server/errors";
import type { LoyaltyTxType } from "@/generated/prisma/enums";

/**
 * Loyalty is a ledger: every change is a LoyaltyTransaction with the resulting balance.
 * The account balance is a projection updated atomically (CHECK balance >= 0).
 */
export async function postLoyalty(
  tx: Tx,
  input: { customerId: string; type: LoyaltyTxType; points: number; orderId?: string | null; reason?: string | null; actorId?: string | null },
) {
  if (!Number.isInteger(input.points) || input.points === 0) throw new RangeError("Loyalty points must be a non-zero integer");
  const account = await tx.loyaltyAccount.upsert({ where: { customerId: input.customerId }, update: {}, create: { customerId: input.customerId } });
  const rows = await tx.$queryRaw<{ balance: number }[]>`
    UPDATE "loyalty_account"
       SET "balance" = "balance" + ${input.points},
           "lifetimeEarned" = "lifetimeEarned" + ${input.type === "EARN" ? input.points : 0},
           "updatedAt" = now()
     WHERE "id" = ${account.id} AND "balance" + ${input.points} >= 0
     RETURNING "balance"`;
  if (!rows[0]) throw new DomainError("CONFLICT", "رصيد النقاط غير كافٍ");
  return tx.loyaltyTransaction.create({
    data: {
      accountId: account.id,
      type: input.type,
      points: input.points,
      balanceAfter: rows[0].balance,
      orderId: input.orderId ?? null,
      reason: input.reason ?? null,
      actorId: input.actorId ?? null,
    },
  });
}

export async function loyaltyBalance(customerId: string) {
  const acc = await db.loyaltyAccount.findUnique({ where: { customerId } });
  return acc?.balance ?? 0;
}

export async function loyaltyHistory(customerId: string, take = 50) {
  const acc = await db.loyaltyAccount.findUnique({ where: { customerId } });
  if (!acc) return { balance: 0, lifetimeEarned: 0, transactions: [] };
  const transactions = await db.loyaltyTransaction.findMany({ where: { accountId: acc.id }, orderBy: { createdAt: "desc" }, take, include: { order: { select: { number: true } } } });
  return { balance: acc.balance, lifetimeEarned: acc.lifetimeEarned, transactions };
}

export async function adjustLoyalty(actor: Actor, customerId: string, points: number, reason: string) {
  assertCan(actor, "loyalty.adjust");
  if (!reason || reason.trim().length < 3) throw invalid("سبب التعديل مطلوب");
  return db.$transaction(async (tx) => {
    const t = await postLoyalty(tx, { customerId, type: "ADJUSTMENT", points, reason, actorId: actorId(actor) });
    await audit(tx, actor, { action: "loyalty.adjust", entityType: "customer", entityId: customerId, after: { points, balanceAfter: t.balanceAfter }, metadata: { reason } });
    return t;
  });
}

/** Reverse every redeem/earn tied to an order (cancellation, full return). Idempotent per order. */
export async function reverseOrderLoyalty(tx: Tx, orderId: string, customerId: string, kinds: ("REDEEM" | "EARN")[]) {
  const txs = await tx.loyaltyTransaction.findMany({ where: { orderId, type: { in: [...kinds, "REVERSAL"] } } });
  const net = new Map<string, number>();
  for (const t of txs) {
    const key = t.type === "REVERSAL" ? (t.reason?.startsWith("reverse:REDEEM") ? "REDEEM" : "EARN") : t.type;
    net.set(key, (net.get(key) ?? 0) + t.points);
  }
  for (const kind of kinds) {
    const outstanding = net.get(kind) ?? 0;
    if (outstanding === 0) continue;
    // Clamp earn reversals to the current balance so customers who already spent points are not driven negative.
    let points = -outstanding;
    if (points < 0) {
      const acc = await tx.loyaltyAccount.findUnique({ where: { customerId } });
      points = Math.max(points, -(acc?.balance ?? 0));
      if (points === 0) continue;
    }
    await postLoyalty(tx, { customerId, type: "REVERSAL", points, orderId, reason: `reverse:${kind}` });
  }
}
