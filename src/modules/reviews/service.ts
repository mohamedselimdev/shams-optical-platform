import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { type CustomerActor, type StaffActor, assertCan } from "@/server/rbac/actor";
import { conflict, notFound } from "@/server/errors";

export const reviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.coerce.number().int().min(1, "اختر التقييم").max(5),
  title: z.string().trim().max(120).optional().transform((v) => v || null),
  body: z.string().trim().max(2000).optional().transform((v) => v || null),
});

/** Reviews are moderated before publication; verified-purchase is derived from delivered orders. */
export async function submitReview(actor: CustomerActor, input: unknown) {
  const data = reviewSchema.parse(input);
  const product = await db.product.findFirst({ where: { id: data.productId, status: "ACTIVE" } });
  if (!product) throw notFound("المنتج");
  const existing = await db.review.findUnique({ where: { productId_customerId: { productId: data.productId, customerId: actor.customerId } } });
  if (existing) throw conflict("لقد قيّمت هذا المنتج من قبل");
  const purchased = await db.orderItem.count({ where: { productId: data.productId, order: { customerId: actor.customerId, status: "DELIVERED" } } });
  return db.review.create({ data: { ...data, customerId: actor.customerId, verifiedPurchase: purchased > 0 } });
}

export async function moderateReview(actor: StaffActor, id: string, status: "APPROVED" | "REJECTED") {
  assertCan(actor, "reviews.moderate");
  const r = await db.review.update({ where: { id }, data: { status, moderatedById: actor.userId } });
  await audit(db, actor, { action: "review.moderate", entityType: "review", entityId: id, after: { status } });
  return r;
}
