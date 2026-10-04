import "server-only";
import { db } from "@/server/db";
import { toEgpString } from "@/lib/money";
import { toCairoLocal } from "@/lib/cairo-time";
import type { PromotionValues } from "./promotion-form";

export async function promotionTargets() {
  const [products, categories, brands, collections] = await Promise.all([
    db.product.findMany({ where: { status: { not: "ARCHIVED" } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    db.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.collection.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const o = (rows: { id: string; name: string }[]) => rows.map((r) => ({ value: r.id, label: r.name }));
  return { PRODUCTS: o(products), CATEGORIES: o(categories), BRANDS: o(brands), COLLECTIONS: o(collections) };
}

type P = Awaited<ReturnType<typeof db.promotion.findUniqueOrThrow>>;

export function promotionValues(p: P | null): PromotionValues {
  if (!p) return { name: "", description: "", kind: "COUPON", code: "", discountType: "PERCENTAGE", value: "", maxDiscount: "", minSubtotal: "", scope: "ORDER", targetIds: [], eligibility: "ALL", excludeSaleItems: false, includeLenses: true, stackable: false, priority: "0", usageLimit: "", usagePerCustomer: "", startsAt: "", endsAt: "", isActive: true };
  return {
    id: p.id, name: p.name, description: p.description ?? "", kind: p.kind, code: p.code ?? "", discountType: p.discountType,
    value: p.discountType === "FREE_SHIPPING" ? "0" : p.discountType === "PERCENTAGE" ? String(p.value / 100) : toEgpString(p.value),
    maxDiscount: p.maxDiscount != null ? toEgpString(p.maxDiscount) : "", minSubtotal: p.minSubtotal ? toEgpString(p.minSubtotal) : "",
    scope: p.scope, targetIds: p.targetIds, eligibility: p.eligibility, excludeSaleItems: p.excludeSaleItems, includeLenses: p.includeLenses, stackable: p.stackable,
    priority: String(p.priority), usageLimit: p.usageLimit ? String(p.usageLimit) : "", usagePerCustomer: p.usagePerCustomer ? String(p.usagePerCustomer) : "",
    startsAt: p.startsAt ? toCairoLocal(p.startsAt) : "", endsAt: p.endsAt ? toCairoLocal(p.endsAt) : "", isActive: p.isActive,
  };
}
