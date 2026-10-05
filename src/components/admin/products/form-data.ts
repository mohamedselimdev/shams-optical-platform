import "server-only";
import { toEgpString } from "@/lib/money";
import { catalogFormOptions } from "@/modules/catalog/service";
import { GENDER_LABELS, PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS } from "@/i18n/labels";
import type { ProductFormValues } from "./product-form";
import { getT } from "@/i18n/server";

const s = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const money = (v: number | null | undefined) => (v === null || v === undefined ? "" : toEgpString(v));

export async function productFormOptions() {
  const [o, t] = await Promise.all([catalogFormOptions(), getT()]);
  const byId = new Map(o.categories.map((c) => [c.id, c]));
  return {
    brands: o.brands.map((b) => ({ value: b.id, label: b.name })),
    categories: o.categories.map((c) => ({ value: c.id, label: c.parentId ? `${byId.get(c.parentId)?.name ?? ""} › ${c.name}` : c.name })),
    collections: o.collections.map((c) => ({ value: c.id, label: c.name })),
    suppliers: o.suppliers.map((c) => ({ value: c.id, label: c.name })),
    types: Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({ value, label: t(label) })),
    statuses: Object.entries(PRODUCT_STATUS_LABELS).map(([value, label]) => ({ value, label: t(label) })),
    genders: Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label: t(label) })),
  };
}

type ProductWithRelations = {
  id: string; slug: string; name: string; nameEn: string | null; description: string | null; descriptionEn: string | null; type: string; status: string; brandId: string | null; categoryId: string | null; supplierId: string | null;
  gender: string | null; frameShape: string | null; frameMaterial: string | null; frameMaterialEn: string | null; rimType: string | null; polarized: boolean; uvProtection: boolean; prescriptionCompatible: boolean; isFeatured: boolean;
  taxRateBps: number | null; seoTitle: string | null; seoDescription: string | null;
  collections: { collectionId: string }[];
  images: { id: string; url: string; alt: string | null; mediaId: string | null }[];
  variants: { id: string; sku: string; barcode: string | null; colorName: string | null; colorNameEn: string | null; colorHex: string | null; sizeLabel: string | null; lensWidthMm: number | null; bridgeMm: number | null; templeMm: number | null; frameWidthMm: number | null; price: number; salePrice: number | null; costPrice: number; isActive: boolean }[];
};

export function toFormValues(p: ProductWithRelations | null, showCost: boolean): ProductFormValues {
  if (!p) {
    return { slug: "", name: "", nameEn: "", description: "", descriptionEn: "", type: "FRAME", status: "DRAFT", brandId: "", categoryId: "", supplierId: "", gender: "", frameShape: "", frameMaterial: "", frameMaterialEn: "", rimType: "", polarized: false, uvProtection: false, prescriptionCompatible: true, isFeatured: false, taxRateBps: "", seoTitle: "", seoDescription: "", collectionIds: [], variants: [], images: [] };
  }
  return {
    id: p.id, slug: p.slug, name: p.name, nameEn: s(p.nameEn), description: s(p.description), descriptionEn: s(p.descriptionEn), type: p.type, status: p.status, brandId: s(p.brandId), categoryId: s(p.categoryId), supplierId: s(p.supplierId),
    gender: s(p.gender), frameShape: s(p.frameShape), frameMaterial: s(p.frameMaterial), frameMaterialEn: s(p.frameMaterialEn), rimType: s(p.rimType), polarized: p.polarized, uvProtection: p.uvProtection, prescriptionCompatible: p.prescriptionCompatible, isFeatured: p.isFeatured,
    taxRateBps: s(p.taxRateBps), seoTitle: s(p.seoTitle), seoDescription: s(p.seoDescription),
    collectionIds: p.collections.map((c) => c.collectionId),
    images: p.images.map((i) => ({ key: i.id, url: i.url, alt: s(i.alt), mediaId: i.mediaId ?? undefined })),
    variants: p.variants.map((v) => ({
      key: v.id, id: v.id, sku: v.sku, barcode: s(v.barcode), colorName: s(v.colorName), colorNameEn: s(v.colorNameEn), colorHex: s(v.colorHex), sizeLabel: s(v.sizeLabel),
      lensWidthMm: s(v.lensWidthMm), bridgeMm: s(v.bridgeMm), templeMm: s(v.templeMm), frameWidthMm: s(v.frameWidthMm),
      price: money(v.price), salePrice: money(v.salePrice), costPrice: showCost ? money(v.costPrice) : "", isActive: v.isActive,
    })),
  };
}
