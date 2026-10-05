import Link from "next/link";
import { requireStaffPage } from "@/server/auth/session";
import { can } from "@/server/rbac/actor";
import { getProductForEdit } from "@/modules/catalog/service";
import { loadOr404 } from "@/components/admin/load";
import { PageHeader } from "@/components/admin/page-header";
import { ProductForm } from "@/components/admin/products/product-form";
import { productFormOptions, toFormValues } from "@/components/admin/products/form-data";
import { db } from "@/server/db";
import { Card, CardHeader, DateText, Table, Td, Th, Money } from "@/ui/primitives";
import { saveProductAction, uploadProductImage } from "../actions";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("تعديل منتج") };
}

const FIELD = { price: "السعر", salePrice: "سعر التخفيض", costPrice: "التكلفة" } as Record<string, string>;

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const t = await getT();
  const actor = await requireStaffPage("catalog.read");
  const { id } = await params;
  const { saved } = await searchParams;
  const product = await loadOr404(() => getProductForEdit(actor, id));
  const canPrice = can(actor, "catalog.price");
  const [options, history] = await Promise.all([
    productFormOptions(),
    db.priceChange.findMany({ where: { variantId: { in: product.variants.map((v) => v.id) }, ...(canPrice ? {} : { field: { not: "costPrice" } }) }, include: { variant: { select: { sku: true } } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return (
    <>
      <PageHeader
        back={{ href: "/admin/products", label: t("المنتجات") }}
        title={product.name}
        actions={product.status === "ACTIVE" ? <Link href={`/products/${product.slug}`} className="text-sm text-sun-700 hover:underline" target="_blank">{t("عرض في المتجر ↗")}</Link> : null}
      />
      {saved ? <p role="status" className="mb-4 rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm text-success">{t("تم إنشاء المنتج")}</p> : null}
      {can(actor, "catalog.write") ? (
        <ProductForm action={saveProductAction} upload={uploadProductImage} initial={toFormValues(product, canPrice)} options={options} canPrice={canPrice} canSeeCost={canPrice} />
      ) : (
        <p className="text-sm text-ink-muted">{t("عرض فقط: لا تملك صلاحية تعديل الكتالوج.")}</p>
      )}
      <Card className="mt-6">
        <CardHeader title={t("سجل تغييرات الأسعار")} description={t("الطلبات السابقة تحتفظ بأسعارها وقت الشراء ولا تتأثر بهذه التغييرات.")} />
        <Table>
          <thead><tr><Th>SKU</Th><Th>{t("الحقل")}</Th><Th>{t("من")}</Th><Th>{t("إلى")}</Th><Th>{t("التاريخ")}</Th></tr></thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <Td className="num">{h.variant.sku}</Td>
                <Td>{t(FIELD[h.field] ?? h.field)}</Td>
                <Td>{h.oldValue === null ? "—" : <Money value={h.oldValue} />}</Td>
                <Td>{h.newValue === null ? "—" : <Money value={h.newValue} />}</Td>
                <Td><DateText value={h.createdAt} withTime /></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  );
}
