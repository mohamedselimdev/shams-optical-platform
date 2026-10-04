import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { type StaffActor, type CustomerActor, assertCan, can } from "@/server/rbac/actor";
import { invalid, notFound } from "@/server/errors";
import { zEgyptPhone } from "@/lib/validation";
import { addressSchema } from "../checkout/service";

export async function listCustomers(actor: StaffActor, q: string | undefined, page = 1) {
  assertCan(actor, "customers.read");
  const where = q
    ? { OR: [{ firstName: { contains: q, mode: "insensitive" as const } }, { lastName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }] }
    : {};
  const [items, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: { _count: { select: { orders: true } }, loyalty: { select: { balance: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 30,
      take: 30,
    }),
    db.customer.count({ where }),
  ]);
  return { items, total, page, pageSize: 30 };
}

/**
 * Customer 360. Sections are included only when the actor holds the matching permission:
 * internal notes need `customers.notes`; prescription summaries need `prescriptions.read`
 * (values themselves are only revealed on the audited prescription detail view).
 */
export async function customer360(actor: StaffActor, id: string) {
  assertCan(actor, "customers.read");
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, emailVerified: true, createdAt: true, status: true } },
      addresses: true,
      orders: { select: { id: true, number: true, status: true, total: true, placedAt: true, paymentStatus: true }, orderBy: { placedAt: "desc" }, take: 50 },
      returns: { select: { id: true, number: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      wishlist: { include: { product: { select: { name: true, slug: true } } } },
      loyalty: true,
    },
  });
  if (!customer) throw notFound("العميل");
  const [notes, prescriptions, stats, loyaltyTx] = await Promise.all([
    can(actor, "customers.notes") ? db.customerNote.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" } }) : Promise.resolve(null),
    can(actor, "prescriptions.read")
      ? db.prescription.findMany({ where: { customerId: id }, select: { id: true, label: true, status: true, createdAt: true, isArchived: true }, orderBy: { createdAt: "desc" } })
      : Promise.resolve(null),
    db.order.aggregate({ where: { customerId: id, status: { notIn: ["CANCELLED", "PENDING_PAYMENT"] } }, _sum: { total: true, refundedTotal: true }, _count: true }),
    customer.loyalty ? db.loyaltyTransaction.findMany({ where: { accountId: customer.loyalty.id }, orderBy: { createdAt: "desc" }, take: 20 }) : Promise.resolve([]),
  ]);
  await audit(db, actor, { action: "customer.view", entityType: "customer", entityId: id });
  return {
    customer,
    notes,
    prescriptions,
    loyaltyTx,
    stats: { orders: stats._count, spent: (stats._sum.total ?? 0) - (stats._sum.refundedTotal ?? 0) },
  };
}

export async function addCustomerNote(actor: StaffActor, customerId: string, body: string) {
  assertCan(actor, "customers.notes");
  const text = body.trim();
  if (text.length < 2) throw invalid("اكتب الملاحظة");
  const note = await db.customerNote.create({ data: { customerId, authorId: actor.userId, body: text.slice(0, 2000) } });
  await audit(db, actor, { action: "customer.note", entityType: "customer", entityId: customerId });
  return note;
}

// ── Customer self-service ──

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, "الاسم مطلوب").max(60),
  lastName: z.string().trim().max(60).optional().transform((v) => v || null),
  phone: z.union([z.literal(""), zEgyptPhone]).optional().transform((v) => v || null),
  marketingOptIn: z.union([z.literal("on"), z.boolean()]).optional().transform((v) => v === true || v === "on"),
});

export async function updateMyProfile(actor: CustomerActor, input: unknown) {
  const data = profileSchema.parse(input);
  await db.customer.update({ where: { id: actor.customerId }, data });
  await db.user.update({ where: { id: actor.userId }, data: { name: [data.firstName, data.lastName].filter(Boolean).join(" "), phone: data.phone } });
}

export async function saveMyAddress(actor: CustomerActor, id: string | null, input: unknown, makeDefault: boolean) {
  const data = addressSchema.extend({ label: z.string().trim().max(40).optional().transform((v) => v || null) }).parse(input);
  return db.$transaction(async (tx) => {
    if (id) {
      const own = await tx.address.findFirst({ where: { id, customerId: actor.customerId } });
      if (!own) throw notFound("العنوان");
    }
    const count = await tx.address.count({ where: { customerId: actor.customerId } });
    const isDefault = makeDefault || count === 0;
    if (isDefault) await tx.address.updateMany({ where: { customerId: actor.customerId }, data: { isDefault: false } });
    return id
      ? tx.address.update({ where: { id }, data: { ...data, isDefault } })
      : tx.address.create({ data: { ...data, customerId: actor.customerId, isDefault } });
  });
}

export async function deleteMyAddress(actor: CustomerActor, id: string) {
  const res = await db.address.deleteMany({ where: { id, customerId: actor.customerId } });
  if (res.count === 0) throw notFound("العنوان");
}

export async function toggleWishlist(actor: CustomerActor, productId: string) {
  const existing = await db.wishlistItem.findUnique({ where: { customerId_productId: { customerId: actor.customerId, productId } } });
  if (existing) {
    await db.wishlistItem.delete({ where: { id: existing.id } });
    return false;
  }
  const product = await db.product.findFirst({ where: { id: productId, status: "ACTIVE" } });
  if (!product) throw notFound("المنتج");
  await db.wishlistItem.create({ data: { customerId: actor.customerId, productId } });
  return true;
}

export async function listMyWishlist(actor: CustomerActor) {
  const rows = await db.wishlistItem.findMany({ where: { customerId: actor.customerId }, orderBy: { createdAt: "desc" }, select: { productId: true } });
  return rows.map((r) => r.productId);
}
