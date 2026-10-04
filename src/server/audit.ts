import "server-only";
import type { DbOrTx } from "./db";
import type { Prisma } from "@/generated/prisma/client";
import { type Actor, actorId } from "./rbac/actor";

export type AuditAction =
  | "inventory.adjust"
  | "inventory.damage"
  | "price.change"
  | "product.create"
  | "product.update"
  | "product.status"
  | "order.status"
  | "order.cancel"
  | "order.create"
  | "payment.refund"
  | "payment.manual_confirm"
  | "payment.reconcile"
  | "prescription.view"
  | "prescription.file_access"
  | "prescription.review"
  | "role.create"
  | "role.update"
  | "staff.create"
  | "staff.update"
  | "staff.roles"
  | "settings.update"
  | "promotion.create"
  | "promotion.update"
  | "transfer.create"
  | "transfer.status"
  | "purchase_order.create"
  | "purchase_order.status"
  | "purchase_order.receive"
  | "return.status"
  | "loyalty.adjust"
  | "customer.note"
  | "customer.view"
  | "cms.update"
  | "branch.create"
  | "branch.update"
  | "supplier.create"
  | "supplier.update"
  | "lens.update"
  | "report.export"
  | "review.moderate"
  | "shipping.update"
  | "auth.login_failed"
  | "auth.locked";

export type AuditEntry = {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  branchId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  ipHash?: string | null;
};

function json(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Append an audit record. Pass the active transaction so the audit commits atomically with the change. */
export async function audit(client: DbOrTx, actor: Actor | null, entry: AuditEntry) {
  await client.auditLog.create({
    data: {
      actorId: actorId(actor),
      actorType: actor?.kind ?? "anonymous",
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      branchId: entry.branchId ?? null,
      before: json(entry.before),
      after: json(entry.after),
      metadata: json(entry.metadata),
      ipHash: entry.ipHash ?? null,
    },
  });
}
