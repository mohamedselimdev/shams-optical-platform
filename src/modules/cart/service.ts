import "server-only";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db, type DbOrTx } from "@/server/db";
import { invalid, notFound, unauthenticated } from "@/server/errors";
import { getSetting } from "@/server/settings";
import { priceLensSelection } from "../lenses/pricing";
import { getOwnedPrescription } from "../prescriptions/service";
import type { PrescriptionValues } from "../prescriptions/schema";

export const CART_COOKIE = "shams_cart";

export const cartItemInclude = {
  variant: {
    include: {
      product: {
        include: {
          brand: { select: { id: true, name: true } },
          category: { select: { id: true, parentId: true } },
          collections: { select: { collectionId: true } },
          images: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { url: true, alt: true } },
        },
      },
      inventory: { where: { branch: { isActive: true } }, select: { onHand: true, reserved: true, branchId: true } },
    },
  },
} as const;

export function newCartToken() {
  return randomBytes(24).toString("base64url");
}

export async function findActiveCart(client: DbOrTx, opts: { token?: string | null; customerId?: string | null }) {
  if (opts.customerId) {
    const c = await client.cart.findFirst({ where: { customerId: opts.customerId, status: "ACTIVE" }, include: { items: { include: cartItemInclude, orderBy: { createdAt: "asc" } } } });
    if (c) return c;
  }
  if (opts.token) {
    const c = await client.cart.findFirst({ where: { token: opts.token, status: "ACTIVE" }, include: { items: { include: cartItemInclude, orderBy: { createdAt: "asc" } } } });
    if (c && (!c.customerId || c.customerId === opts.customerId)) return c;
  }
  return null;
}

export type CartWithItems = NonNullable<Awaited<ReturnType<typeof findActiveCart>>>;

export async function ensureCart(opts: { token?: string | null; customerId?: string | null }) {
  const existing = await findActiveCart(db, opts);
  if (existing) return existing;
  return db.cart.create({
    data: { token: newCartToken(), customerId: opts.customerId ?? null },
    include: { items: { include: cartItemInclude } },
  });
}

export const addToCartSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(20).default(1),
  lensTypeId: z.string().optional().transform((v) => v || null),
  lensIndexId: z.string().optional().transform((v) => v || null),
  lensOptionIds: z.array(z.string()).default([]),
  prescriptionMode: z.enum(["NONE", "SAVED", "UPLOADED", "ENTERED"]).default("NONE"),
  prescriptionId: z.string().optional().transform((v) => v || null),
});

export type AddToCartInput = z.input<typeof addToCartSchema>;

/** Validate a lens configuration for a line (shared by add-to-cart and checkout revalidation). */
export async function validateLensLine(
  client: DbOrTx,
  line: { product: { prescriptionCompatible: boolean; type: string }; lensTypeId: string | null; lensIndexId: string | null; lensOptionIds: string[]; prescriptionMode: string; prescriptionId: string | null },
  customerId: string | null,
) {
  if (!line.lensTypeId) {
    if (line.lensIndexId || line.lensOptionIds.length || line.prescriptionMode !== "NONE") throw invalid("إعداد العدسات غير مكتمل");
    return { lens: null, prescription: null };
  }
  if (!line.product.prescriptionCompatible) throw invalid("هذا الإطار لا يدعم تركيب العدسات");
  if (!line.lensIndexId) throw invalid("اختر معامل انكسار العدسة");
  const type = await client.lensType.findUnique({ where: { id: line.lensTypeId } });
  if (!type) throw invalid("نوع العدسة غير متاح");
  let prescription: (PrescriptionValues & { id: string; status: string }) | null = null;
  if (type.requiresPrescription) {
    if (line.prescriptionMode === "NONE" || !line.prescriptionId) throw invalid("هذه العدسات تتطلب وصفة طبية");
    if (!customerId) throw unauthenticated();
    const rx = await getOwnedPrescription(customerId, line.prescriptionId);
    prescription = rx as unknown as PrescriptionValues & { id: string; status: string };
  } else if (line.prescriptionMode !== "NONE") {
    throw invalid("هذه العدسات لا تحتاج وصفة");
  }
  const hasValues = prescription && (prescription.odSph !== null || prescription.osSph !== null);
  const lens = await priceLensSelection(
    client,
    { lensTypeId: line.lensTypeId, lensIndexId: line.lensIndexId, optionIds: line.lensOptionIds },
    hasValues ? prescription : null,
  );
  return { lens, prescription };
}

export async function addToCart(cartId: string, customerId: string | null, input: AddToCartInput) {
  const data = addToCartSchema.parse(input);
  const checkout = await getSetting("checkout");
  const variant = await db.productVariant.findUnique({ where: { id: data.variantId }, include: { product: true } });
  if (!variant || !variant.isActive || variant.product.status !== "ACTIVE") throw notFound("المنتج");
  await validateLensLine(db, { product: variant.product, ...data }, customerId);

  const hasLens = Boolean(data.lensTypeId);
  // Frame-only lines of the same variant merge; configured lens lines are always separate.
  const existing = hasLens
    ? null
    : await db.cartItem.findFirst({ where: { cartId, variantId: data.variantId, lensTypeId: null } });
  const quantity = (existing?.quantity ?? 0) + data.quantity;
  if (quantity > checkout.maxQuantityPerLine) throw invalid(`الحد الأقصى ${checkout.maxQuantityPerLine} قطع لكل منتج`);

  if (existing) {
    await db.cartItem.update({ where: { id: existing.id }, data: { quantity } });
  } else {
    await db.cartItem.create({
      data: {
        cartId,
        variantId: data.variantId,
        quantity: data.quantity,
        lensTypeId: data.lensTypeId,
        lensIndexId: data.lensIndexId,
        lensOptionIds: data.lensOptionIds,
        prescriptionMode: data.prescriptionMode,
        prescriptionId: data.prescriptionId,
      },
    });
  }
  await db.cart.update({ where: { id: cartId }, data: { lastActivityAt: new Date(), abandonedAt: null } });
}

export async function updateCartItem(cartId: string, itemId: string, quantity: number) {
  const checkout = await getSetting("checkout");
  const item = await db.cartItem.findFirst({ where: { id: itemId, cartId } });
  if (!item) throw notFound("المنتج في السلة");
  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: item.id } });
  } else {
    if (quantity > checkout.maxQuantityPerLine) throw invalid(`الحد الأقصى ${checkout.maxQuantityPerLine} قطع لكل منتج`);
    await db.cartItem.update({ where: { id: item.id }, data: { quantity } });
  }
  await db.cart.update({ where: { id: cartId }, data: { lastActivityAt: new Date() } });
}

export async function setCartCoupon(cartId: string, code: string | null) {
  await db.cart.update({ where: { id: cartId }, data: { couponCode: code ? code.trim().toUpperCase().slice(0, 30) : null, lastActivityAt: new Date() } });
}

/**
 * After login: fold the guest cart into the customer's active cart (or adopt it).
 * Quantities of identical frame-only lines are summed up to the per-line maximum.
 */
export async function mergeGuestCart(guestToken: string | null | undefined, customerId: string) {
  if (!guestToken) return;
  const checkout = await getSetting("checkout");
  await db.$transaction(async (tx) => {
    const guest = await tx.cart.findFirst({ where: { token: guestToken, status: "ACTIVE", customerId: null }, include: { items: true } });
    if (!guest) return;
    const target = await tx.cart.findFirst({ where: { customerId, status: "ACTIVE" }, include: { items: true } });
    if (!target) {
      await tx.cart.update({ where: { id: guest.id }, data: { customerId } });
      return;
    }
    for (const item of guest.items) {
      const same = !item.lensTypeId ? target.items.find((t) => t.variantId === item.variantId && !t.lensTypeId) : undefined;
      if (same) {
        await tx.cartItem.update({ where: { id: same.id }, data: { quantity: Math.min(checkout.maxQuantityPerLine, same.quantity + item.quantity) } });
      } else {
        // Prescription references only carry over if they belong to this customer.
        const ownsRx = item.prescriptionId ? await tx.prescription.count({ where: { id: item.prescriptionId, customerId } }) : 1;
        if (!ownsRx) continue;
        await tx.cartItem.create({
          data: {
            cartId: target.id,
            variantId: item.variantId,
            quantity: item.quantity,
            lensTypeId: item.lensTypeId,
            lensIndexId: item.lensIndexId,
            lensOptionIds: item.lensOptionIds,
            prescriptionMode: item.prescriptionMode,
            prescriptionId: item.prescriptionId,
          },
        });
      }
    }
    await tx.cart.update({ where: { id: guest.id }, data: { status: "MERGED" } });
    await tx.cart.update({ where: { id: target.id }, data: { lastActivityAt: new Date() } });
  });
}
