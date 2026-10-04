import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { effectivePrice } from "./service";

/** Storefront listing filters. Parsed from URL search params; unknown values are ignored. */
export const catalogFilterSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().max(120).optional(),
  brand: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v ? (Array.isArray(v) ? v : v.split(",")) : [])),
  collection: z.string().max(120).optional(),
  type: z.enum(["FRAME", "SUNGLASSES", "ACCESSORY", "CONTACT_LENS"]).optional().catch(undefined),
  gender: z.enum(["MEN", "WOMEN", "UNISEX", "KIDS"]).optional().catch(undefined),
  shape: z.string().max(40).optional(),
  material: z.string().max(40).optional(),
  color: z.string().max(40).optional(),
  min: z.coerce.number().int().min(0).optional().catch(undefined),
  max: z.coerce.number().int().min(0).optional().catch(undefined),
  polarized: z.literal("1").optional().catch(undefined),
  rx: z.literal("1").optional().catch(undefined),
  sale: z.literal("1").optional().catch(undefined),
  instock: z.literal("1").optional().catch(undefined),
  sort: z.enum(["newest", "price_asc", "price_desc", "popular"]).default("newest").catch("newest"),
  page: z.coerce.number().int().min(1).max(500).default(1).catch(1),
});

export type CatalogFilter = z.infer<typeof catalogFilterSchema>;
export const PAGE_SIZE = 24;

export function parseCatalogFilter(params: Record<string, string | string[] | undefined>): CatalogFilter {
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) flat[k] = Array.isArray(v) && k !== "brand" ? v[0] : v;
  return catalogFilterSchema.parse(flat);
}

function buildWhere(f: CatalogFilter): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [{ status: "ACTIVE" }, { variants: { some: { isActive: true } } }];
  if (f.q) {
    and.push({
      OR: [
        { name: { contains: f.q, mode: "insensitive" } },
        { nameEn: { contains: f.q, mode: "insensitive" } },
        { brand: { name: { contains: f.q, mode: "insensitive" } } },
        { brand: { nameEn: { contains: f.q, mode: "insensitive" } } },
        { variants: { some: { sku: { contains: f.q, mode: "insensitive" } } } },
      ],
    });
  }
  if (f.category) and.push({ OR: [{ category: { slug: f.category } }, { category: { parent: { slug: f.category } } }] });
  if (f.brand.length) and.push({ brand: { slug: { in: f.brand } } });
  if (f.collection) and.push({ collections: { some: { collection: { slug: f.collection } } } });
  if (f.type) and.push({ type: f.type });
  if (f.gender) and.push({ gender: { in: [f.gender, "UNISEX"] } });
  if (f.shape) and.push({ frameShape: f.shape });
  if (f.material) and.push({ frameMaterial: f.material });
  if (f.color) and.push({ variants: { some: { isActive: true, colorName: f.color } } });
  if (f.min !== undefined) and.push({ minPrice: { gte: f.min * 100 } });
  if (f.max !== undefined) and.push({ minPrice: { lte: f.max * 100 } });
  if (f.polarized) and.push({ polarized: true });
  if (f.rx) and.push({ prescriptionCompatible: true });
  if (f.sale) and.push({ variants: { some: { isActive: true, salePrice: { not: null } } } });
  if (f.instock) and.push({ variants: { some: { isActive: true, inventory: { some: { onHand: { gt: 0 }, branch: { isActive: true } } } } } });
  return { AND: and };
}

const orderBy: Record<CatalogFilter["sort"], Prisma.ProductOrderByWithRelationInput[]> = {
  newest: [{ publishedAt: "desc" }, { id: "asc" }],
  price_asc: [{ minPrice: "asc" }, { id: "asc" }],
  price_desc: [{ minPrice: "desc" }, { id: "asc" }],
  popular: [{ salesCount: "desc" }, { publishedAt: "desc" }],
};

export const productCardSelect = {
  id: true,
  slug: true,
  name: true,
  type: true,
  minPrice: true,
  polarized: true,
  prescriptionCompatible: true,
  brand: { select: { name: true, slug: true } },
  images: { select: { url: true, alt: true }, orderBy: { sortOrder: "asc" }, take: 2 },
  variants: {
    where: { isActive: true },
    select: { id: true, price: true, salePrice: true, colorName: true, colorHex: true, inventory: { select: { onHand: true, reserved: true } } },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof productCardSelect }>;

export function toProductCard(p: CardRow) {
  const prices = p.variants.map((v) => ({ eff: effectivePrice(v), base: v.price }));
  const cheapest = prices.reduce((a, b) => (b.eff < a.eff ? b : a), prices[0] ?? { eff: p.minPrice, base: p.minPrice });
  const available = p.variants.reduce((s, v) => s + v.inventory.reduce((x, i) => x + Math.max(0, i.onHand - i.reserved), 0), 0);
  const colors = [...new Map(p.variants.filter((v) => v.colorHex).map((v) => [v.colorHex!, { hex: v.colorHex!, name: v.colorName }])).values()];
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.type,
    brand: p.brand,
    image: p.images[0] ?? null,
    hoverImage: p.images[1] ?? null,
    price: cheapest.eff,
    compareAt: cheapest.base > cheapest.eff ? cheapest.base : null,
    inStock: available > 0,
    colors,
    prescriptionCompatible: p.prescriptionCompatible,
    polarized: p.polarized,
  };
}

export type ProductCard = ReturnType<typeof toProductCard>;

export async function searchProducts(f: CatalogFilter) {
  const where = buildWhere(f);
  const [rows, total] = await Promise.all([
    db.product.findMany({ where, select: productCardSelect, orderBy: orderBy[f.sort], skip: (f.page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
    db.product.count({ where }),
  ]);
  return { items: rows.map(toProductCard), total, page: f.page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Facet values for the filter sidebar, scoped to active products. */
export async function catalogFacets() {
  const [brands, shapes, materials, colors, categories] = await Promise.all([
    db.brand.findMany({ where: { isActive: true, products: { some: { status: "ACTIVE" } } }, select: { slug: true, name: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.product.groupBy({ by: ["frameShape"], where: { status: "ACTIVE", frameShape: { not: null } }, _count: true }),
    db.product.groupBy({ by: ["frameMaterial"], where: { status: "ACTIVE", frameMaterial: { not: null } }, _count: true }),
    db.productVariant.groupBy({ by: ["colorName"], where: { isActive: true, colorName: { not: null }, product: { status: "ACTIVE" } }, _count: true }),
    db.category.findMany({ where: { isActive: true, parentId: null }, select: { slug: true, name: true, children: { where: { isActive: true }, select: { slug: true, name: true } } }, orderBy: { sortOrder: "asc" } }),
  ]);
  return {
    brands,
    categories,
    shapes: shapes.map((s) => s.frameShape!).sort(),
    materials: materials.map((m) => m.frameMaterial!).sort(),
    colors: colors.map((c) => c.colorName!).sort(),
  };
}

export async function getProductBySlug(slug: string) {
  const product = await db.product.findFirst({
    where: { slug, status: "ACTIVE" },
    include: {
      brand: true,
      category: { include: { parent: true } },
      images: { orderBy: { sortOrder: "asc" } },
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
        include: { inventory: { where: { branch: { isActive: true } }, select: { onHand: true, reserved: true, branchId: true } } },
      },
      reviews: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 20, include: { customer: { select: { firstName: true } } } },
    },
  });
  if (!product) return null;
  const ratingAgg = await db.review.aggregate({ where: { productId: product.id, status: "APPROVED" }, _avg: { rating: true }, _count: true });
  return {
    ...product,
    // Strip cost from anything that reaches the storefront.
    variants: product.variants.map(({ costPrice: _cost, inventory, ...v }) => ({
      ...v,
      effectivePrice: effectivePrice(v),
      available: inventory.reduce((s, i) => s + Math.max(0, i.onHand - i.reserved), 0),
    })),
    rating: { average: ratingAgg._avg.rating ?? 0, count: ratingAgg._count },
  };
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;

export async function relatedProducts(productId: string, categoryId: string | null, brandId: string | null, take = 8) {
  const rows = await db.product.findMany({
    where: { status: "ACTIVE", id: { not: productId }, OR: [{ categoryId: categoryId ?? undefined }, { brandId: brandId ?? undefined }] },
    select: productCardSelect,
    orderBy: { salesCount: "desc" },
    take,
  });
  return rows.map(toProductCard);
}

export async function productCardsByIds(ids: string[]) {
  if (!ids.length) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids }, status: "ACTIVE" }, select: productCardSelect });
  const map = new Map(rows.map((r) => [r.id, toProductCard(r)]));
  return ids.map((id) => map.get(id)).filter((p): p is ProductCard => Boolean(p));
}

/** Product rail for a CMS home section. Unknown section types return nothing. */
export async function homeRail(type: string, config: { limit?: number; collectionSlug?: string }) {
  const take = Math.min(Math.max(config.limit ?? 8, 2), 24);
  const base: Prisma.ProductWhereInput = { status: "ACTIVE", variants: { some: { isActive: true } } };
  const query = (where: Prisma.ProductWhereInput, order: Prisma.ProductOrderByWithRelationInput[]) =>
    db.product.findMany({ where: { ...base, ...where }, select: productCardSelect, orderBy: order, take }).then((rows) => rows.map(toProductCard));
  switch (type) {
    case "FEATURED_PRODUCTS":
      return query({ isFeatured: true }, [{ salesCount: "desc" }, { id: "asc" }]);
    case "NEW_ARRIVALS":
      return query({}, orderBy.newest);
    case "BEST_SELLERS":
      return query({}, orderBy.popular);
    case "COLLECTION":
      return config.collectionSlug ? query({ collections: { some: { collection: { slug: config.collectionSlug } } } }, orderBy.popular) : [];
    default:
      return [];
  }
}

export async function storefrontTaxonomy() {
  const [categories, brands] = await Promise.all([
    db.category.findMany({ where: { isActive: true, parentId: null }, select: { slug: true, name: true, description: true }, orderBy: { sortOrder: "asc" } }),
    db.brand.findMany({ where: { isActive: true, products: { some: { status: "ACTIVE" } } }, select: { slug: true, name: true, logoUrl: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  return { categories, brands };
}

export async function taxonomyBySlug(kind: "category" | "brand" | "collection", slug: string) {
  const where = { slug, isActive: true };
  if (kind === "category") return db.category.findFirst({ where, select: { name: true, description: true, slug: true, parent: { select: { name: true, slug: true } } } });
  if (kind === "brand") return db.brand.findFirst({ where, select: { name: true, description: true, slug: true } });
  return db.collection.findFirst({ where, select: { name: true, description: true, slug: true } });
}

/**
 * Per-branch availability for a product's variants, for "available at branch" display.
 * Exposes only a coarse level (none / low / in stock), never exact counts.
 */
export async function branchAvailability(productId: string) {
  const rows = await db.inventoryItem.findMany({
    where: { variant: { productId, isActive: true }, branch: { isActive: true, type: "STORE" } },
    select: { variantId: true, branchId: true, onHand: true, reserved: true },
  });
  return rows.map((r) => {
    const free = r.onHand - r.reserved;
    return { variantId: r.variantId, branchId: r.branchId, level: free <= 0 ? ("none" as const) : free <= 2 ? ("low" as const) : ("ok" as const) };
  });
}
