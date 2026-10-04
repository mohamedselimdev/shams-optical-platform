import "server-only";
import { z } from "zod";
import { db, type Tx } from "@/server/db";
import { audit } from "@/server/audit";
import { type Actor, actorId, assertCan, can } from "@/server/rbac/actor";
import { conflict, forbidden, invalid, notFound } from "@/server/errors";
import { zCheckbox, zEgp, zOptionalEgp, zOptionalInt, zOptionalText, zSlug, zText } from "@/lib/validation";

export const variantSchema = z.object({
  id: z.string().optional().transform((v) => v || undefined),
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-_.]{1,40}$/, "SKU غير صالح"),
  barcode: zOptionalText(40),
  colorName: zOptionalText(60),
  colorHex: z.union([z.literal(""), z.string().regex(/^#[0-9a-fA-F]{6}$/, "لون غير صالح")]).optional().transform((v) => v || null),
  sizeLabel: zOptionalText(20),
  lensWidthMm: zOptionalInt(20, 80),
  bridgeMm: zOptionalInt(10, 30),
  templeMm: zOptionalInt(100, 170),
  frameWidthMm: zOptionalInt(80, 180),
  price: zEgp,
  salePrice: zOptionalEgp,
  costPrice: zOptionalEgp,
  weightGrams: zOptionalInt(1, 2000),
  isActive: zCheckbox,
});

export const productSchema = z.object({
  slug: zSlug,
  name: zText(160),
  nameEn: zOptionalText(160),
  description: zOptionalText(5000),
  type: z.enum(["FRAME", "SUNGLASSES", "ACCESSORY", "CONTACT_LENS"]),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  brandId: z.string().optional().transform((v) => v || null),
  categoryId: z.string().optional().transform((v) => v || null),
  supplierId: z.string().optional().transform((v) => v || null),
  gender: z.union([z.literal(""), z.enum(["MEN", "WOMEN", "UNISEX", "KIDS"])]).optional().transform((v) => v || null),
  frameShape: zOptionalText(40),
  frameMaterial: zOptionalText(40),
  rimType: zOptionalText(40),
  polarized: zCheckbox,
  uvProtection: zCheckbox,
  prescriptionCompatible: zCheckbox,
  isFeatured: zCheckbox,
  taxRateBps: zOptionalInt(0, 5000),
  seoTitle: zOptionalText(160),
  seoDescription: zOptionalText(320),
  collectionIds: z.array(z.string()).default([]),
  variants: z.array(variantSchema).min(1, "أضف متغيراً واحداً على الأقل"),
  images: z
    .array(z.object({ url: z.string().trim().min(1).max(500), alt: z.string().trim().max(160).optional(), mediaId: z.string().optional() }))
    .default([]),
});

export type ProductInput = z.input<typeof productSchema>;

export const effectivePrice = (v: { price: number; salePrice: number | null }) =>
  v.salePrice !== null && v.salePrice < v.price ? v.salePrice : v.price;

async function refreshMinPrice(tx: Tx, productId: string) {
  const variants = await tx.productVariant.findMany({ where: { productId, isActive: true }, select: { price: true, salePrice: true } });
  const min = variants.length ? Math.min(...variants.map(effectivePrice)) : 0;
  await tx.product.update({ where: { id: productId }, data: { minPrice: min } });
}

/**
 * Create or update a product with its variants and media in one transaction.
 * Price/cost edits require `catalog.price`, are written to the price-change history and audited.
 * Variants are never hard-deleted once referenced; removed variants are deactivated.
 */
export async function saveProduct(actor: Actor, id: string | null, input: ProductInput) {
  assertCan(actor, "catalog.write");
  const data = productSchema.parse(input);
  const canPrice = can(actor, "catalog.price");

  for (const v of data.variants) {
    if (v.salePrice !== null && v.salePrice > v.price) throw invalid(`سعر التخفيض أكبر من السعر الأصلي (${v.sku})`);
  }
  const skus = data.variants.map((v) => v.sku);
  if (new Set(skus).size !== skus.length) throw invalid("SKU مكرر داخل نفس المنتج");

  return db.$transaction(async (tx) => {
    const dupSlug = await tx.product.findFirst({ where: { slug: data.slug, ...(id ? { NOT: { id } } : {}) } });
    if (dupSlug) throw conflict("رابط المنتج مستخدم بالفعل");
    const dupSku = await tx.productVariant.findFirst({ where: { sku: { in: skus }, ...(id ? { NOT: { productId: id } } : {}) } });
    if (dupSku) throw conflict(`SKU مستخدم في منتج آخر: ${dupSku.sku}`);
    const barcodes = data.variants.map((v) => v.barcode).filter((b): b is string => Boolean(b));
    if (barcodes.length) {
      const dupBarcode = await tx.productVariant.findFirst({ where: { barcode: { in: barcodes }, ...(id ? { NOT: { productId: id } } : {}) } });
      if (dupBarcode) throw conflict(`الباركود مستخدم في منتج آخر: ${dupBarcode.barcode}`);
    }

    const { variants, images, collectionIds, ...productData } = data;
    const before = id ? await tx.product.findUnique({ where: { id }, include: { variants: true } }) : null;
    if (id && !before) throw notFound("المنتج");

    const product = id
      ? await tx.product.update({
          where: { id },
          data: { ...productData, publishedAt: productData.status === "ACTIVE" ? (before?.publishedAt ?? new Date()) : before?.publishedAt },
        })
      : await tx.product.create({ data: { ...productData, publishedAt: productData.status === "ACTIVE" ? new Date() : null } });

    const existing = new Map((before?.variants ?? []).map((v) => [v.id, v]));
    const kept = new Set<string>();

    for (const [index, v] of variants.entries()) {
      const prev = v.id ? existing.get(v.id) : undefined;
      if (v.id && !prev) throw invalid("متغير غير تابع لهذا المنتج");
      const priceFields = { price: v.price, salePrice: v.salePrice, costPrice: v.costPrice ?? prev?.costPrice ?? 0 };
      if (prev) {
        const changes = (["price", "salePrice", "costPrice"] as const).filter((f) => prev[f] !== priceFields[f]);
        if (changes.length && !canPrice) throw forbidden("تعديل الأسعار يتطلب صلاحية الأسعار");
        await tx.productVariant.update({
          where: { id: prev.id },
          data: { ...v, id: undefined, ...priceFields, sortOrder: index },
        });
        for (const field of changes) {
          await tx.priceChange.create({ data: { variantId: prev.id, field, oldValue: prev[field], newValue: priceFields[field], actorId: actorId(actor) } });
        }
        if (changes.length) {
          await audit(tx, actor, {
            action: "price.change",
            entityType: "product_variant",
            entityId: prev.id,
            before: Object.fromEntries(changes.map((f) => [f, prev[f]])),
            after: Object.fromEntries(changes.map((f) => [f, priceFields[f]])),
            metadata: { sku: v.sku },
          });
        }
        kept.add(prev.id);
      } else {
        if (!canPrice && id) throw forbidden("إضافة متغير بسعر يتطلب صلاحية الأسعار");
        const created = await tx.productVariant.create({ data: { ...v, id: undefined, ...priceFields, productId: product.id, sortOrder: index } });
        await tx.priceChange.create({ data: { variantId: created.id, field: "price", oldValue: null, newValue: v.price, actorId: actorId(actor) } });
        kept.add(created.id);
      }
    }
    for (const prev of existing.values()) {
      if (!kept.has(prev.id) && prev.isActive) {
        await tx.productVariant.update({ where: { id: prev.id }, data: { isActive: false } });
      }
    }

    await tx.productImage.deleteMany({ where: { productId: product.id } });
    if (images.length) {
      await tx.productImage.createMany({
        data: images.map((img, i) => ({ productId: product.id, url: img.url, alt: img.alt || data.name, mediaId: img.mediaId || null, sortOrder: i })),
      });
    }
    await tx.collectionProduct.deleteMany({ where: { productId: product.id } });
    if (collectionIds.length) {
      await tx.collectionProduct.createMany({ data: collectionIds.map((collectionId) => ({ collectionId, productId: product.id })) });
    }
    await refreshMinPrice(tx, product.id);

    await audit(tx, actor, {
      action: id ? "product.update" : "product.create",
      entityType: "product",
      entityId: product.id,
      before: before ? { name: before.name, status: before.status, slug: before.slug } : undefined,
      after: { name: product.name, status: product.status, slug: product.slug },
    });
    return product;
  });
}

const taxonomySchema = z.object({
  slug: zSlug,
  name: zText(120),
  nameEn: zOptionalText(120),
  description: zOptionalText(1000),
  isActive: zCheckbox,
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const categorySchema = taxonomySchema.extend({ parentId: z.string().optional().transform((v) => v || null) });
export const brandSchema = taxonomySchema.extend({ logoUrl: zOptionalText(500) });
export const collectionSchema = taxonomySchema;

type TaxonomyKind = "category" | "brand" | "collection";

export async function saveTaxonomy(actor: Actor, kind: TaxonomyKind, id: string | null, input: unknown) {
  assertCan(actor, "catalog.write");
  const schema = kind === "category" ? categorySchema : kind === "brand" ? brandSchema : collectionSchema;
  const data = schema.parse(input) as z.infer<typeof categorySchema> & z.infer<typeof brandSchema>;
  return db.$transaction(async (tx) => {
    // Dynamic delegate access keeps one implementation for the three taxonomy tables.
    const delegate = tx[kind] as unknown as {
      findFirst(args: unknown): Promise<{ id: string } | null>;
      create(args: unknown): Promise<{ id: string }>;
      update(args: unknown): Promise<{ id: string }>;
    };
    const dup = await delegate.findFirst({ where: { slug: data.slug, ...(id ? { NOT: { id } } : {}) } });
    if (dup) throw conflict("الرابط مستخدم بالفعل");
    if (kind === "category" && id && data.parentId) {
      // Reject cycles: walk up from the new parent.
      let cursor: string | null = data.parentId;
      while (cursor) {
        if (cursor === id) throw invalid("لا يمكن جعل التصنيف أباً لنفسه");
        const parentRow: { parentId: string | null } | null = await tx.category.findUnique({ where: { id: cursor }, select: { parentId: true } });
        cursor = parentRow?.parentId ?? null;
      }
    }
    const row = id ? await delegate.update({ where: { id }, data }) : await delegate.create({ data });
    await audit(tx, actor, { action: "product.update", entityType: kind, entityId: row.id, after: data });
    return row;
  });
}
